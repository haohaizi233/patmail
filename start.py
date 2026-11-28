"""PatMail 开发构建入口。

在 patmail-extension 执行一次生产构建，结果写入 dist。

- 插件工作台是 dist 里的扩展页面，不另开本地端口
- 管理端原型是项目根目录的 Vite 开发预览，需要时手动运行根目录的 `pnpm dev`，本脚本不再启动它
- 下载由扩展在浏览器内完成，本脚本不启动下载桥接
"""

from __future__ import annotations

import functools
import os
import shutil
import signal
import subprocess
import sys
import threading
import time
import urllib.request
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
EXTENSION = ROOT / "patmail-extension"
STREAM_BRIDGE_PORT = 42843

processes: list[subprocess.Popen[str]] = []
stopping = False
bridge_stop = threading.Event()
print = functools.partial(print, flush=True)


def reconfigure_output() -> None:
    """子进程日志里有 ➜ 这类字符，GBK 终端直接 print 会崩，统一改成可替换。"""
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            try:
                stream.reconfigure(errors="replace")
            except (ValueError, OSError):
                pass


def registry_paths() -> list[str]:
    if sys.platform != "win32":
        return []
    import winreg

    found: list[str] = []
    keys = (
        (winreg.HKEY_CURRENT_USER, r"Environment"),
        (winreg.HKEY_LOCAL_MACHINE, r"SYSTEM\CurrentControlSet\Control\Session Manager\Environment"),
    )
    for hive, subkey in keys:
        try:
            with winreg.OpenKey(hive, subkey) as key:
                value, _ = winreg.QueryValueEx(key, "Path")
        except OSError:
            continue
        if isinstance(value, str):
            found.extend(
                os.path.expandvars(part.strip())
                for part in value.split(os.pathsep)
                if part.strip()
            )
    return found


def search_path() -> str:
    local = os.environ.get("LOCALAPPDATA", "")
    roaming = os.environ.get("APPDATA", "")
    program_files = os.environ.get("ProgramFiles", r"C:\Program Files")
    program_files_x86 = os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)")
    directories = [
        *os.environ.get("PATH", "").split(os.pathsep),
        *registry_paths(),
        str(Path(program_files) / "nodejs"),
        str(Path(program_files_x86) / "nodejs"),
        str(Path(local) / "Programs" / "nodejs"),
        str(Path(roaming) / "npm"),
        str(Path(local) / "pnpm"),
    ]
    unique: list[str] = []
    for directory in directories:
        if directory and directory not in unique:
            unique.append(directory)
    return os.pathsep.join(unique)


def command(name: str) -> str | None:
    path = search_path()
    if sys.platform == "win32":
        found = shutil.which(f"{name}.cmd", path=path)
        if found:
            return found
    return shutil.which(name, path=path)


def tool_env() -> dict[str, str]:
    env = os.environ.copy()
    env["PATH"] = search_path()
    return env


def fail(message: str) -> None:
    print(message, file=sys.stderr)
    reconfigure_output()
    if processes:
        stop()
    if sys.platform == "win32" and sys.stdin.isatty():
        try:
            input("按回车关闭...")
        except EOFError:
            pass
    raise SystemExit(1)


def stop() -> None:
    global stopping
    if stopping:
        return
    stopping = True
    bridge_stop.set()
    print("\n正在停止服务...")
    for proc in processes:
        if proc.poll() is not None:
            continue
        if sys.platform == "win32":
            subprocess.run(
                ["taskkill", "/F", "/T", "/PID", str(proc.pid)],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                check=False,
            )
        else:
            proc.terminate()
    for proc in processes:
        try:
            proc.wait(timeout=8)
        except subprocess.TimeoutExpired:
            proc.kill()


def handle_stop(signum: int, _frame: object) -> None:
    stop()
    raise SystemExit(0)


def user_env_value(name: str) -> str:
    """用户级环境变量。setx 之后，已经在跑的终端（含它新开的页签）拿不到新值，所以直接读注册表。"""
    if sys.platform == "win32":
        import winreg

        try:
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Environment") as key:
                value, _ = winreg.QueryValueEx(key, name)
        except OSError:
            return ""
        return value if isinstance(value, str) else ""
    return os.environ.get(name, "")


def pull_sme_customers() -> None:
    """设了 DB_PWD 就每次启动前拉一份中小客户名单快照；没设或失败就沿用现有文件。"""
    script = EXTENSION / "scripts" / "pull-sme-customers.py"
    stored = os.environ.get("DB_PWD") or user_env_value("DB_PWD")
    if not script.is_file() or not stored:
        print("没有设置 DB_PWD，跳过中小客户名单快照拉取，编译沿用现有快照文件。")
        return
    print("拉取中小客户名单快照...")
    env = tool_env()
    env["DB_PWD"] = stored
    result = subprocess.run(
        [sys.executable, str(script)],
        cwd=EXTENSION,
        env=env,
        check=False,
    )
    if result.returncode != 0:
        print("快照没有更新，编译沿用上一次的文件。")


def build_extension(runner: str) -> None:
    if not (EXTENSION / "package.json").is_file():
        fail("找不到 patmail-extension/package.json，无法编译插件。")
    if not (EXTENSION / "node_modules" / "vite").is_dir():
        print("插件依赖不完整，正在按插件目录的锁文件恢复...")
        install = subprocess.run(
            [runner, "install", "--frozen-lockfile"],
            cwd=EXTENSION,
            env=tool_env(),
            check=False,
        )
        if install.returncode != 0:
            fail("插件依赖恢复失败。请在 patmail-extension 目录查看 pnpm install 的输出。")
    pull_sme_customers()
    print(f"编译插件    {EXTENSION / 'dist'}")
    build = subprocess.run(
        [runner, "run", "build"],
        cwd=EXTENSION,
        env=tool_env(),
        check=False,
    )
    if build.returncode != 0:
        fail(f"插件编译失败，退出码 {build.returncode}。")
    print("插件编译完成。若 Chrome 已加载该扩展，请在扩展管理页重新加载。")
    print()


def main() -> None:
    reconfigure_output()
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    signal.signal(signal.SIGINT, handle_stop)
    if sys.platform == "win32":
        signal.signal(signal.SIGBREAK, handle_stop)

    runner = command("pnpm") or command("npm")
    if runner is None:
        fail("未找到 pnpm 或 npm。请先安装 Node.js。")

    print("PatMail")
    print(f"插件目录    {EXTENSION / 'dist'}")
    print("工作台跟着扩展走：在 Chrome 里点 PatMail 图标，或在 EASY 页面点「打开工作台」。")
    print("管理端原型不再随本脚本启动；要看原型，在项目根目录运行 pnpm dev。")
    print()

    build_extension(runner)


def start_stream_bridge() -> None:
    """复用健康桥接；启动子进程后确认就绪再允许下载。"""
    def healthy() -> bool:
        try:
            with urllib.request.urlopen(f'http://127.0.0.1:{STREAM_BRIDGE_PORT}/health', timeout=1) as response:
                info = json.load(response)
                if info.get('protocol') == 'patmail-stream-v1' and (info.get('version') != 2 or 'metadata-journal' not in info.get('features', [])):
                    raise RuntimeError('检测到旧版下载桥接。请先暂停当前下载，再关闭旧版 start.py 或旧桥接进程并重新启动，以启用增量缓存。')
                return info.get('protocol') == 'patmail-stream-v1' and info.get('version') == 2
        except (OSError, ValueError):
            return False

    if healthy():
        return
    script = EXTENSION / 'scripts' / 'download' / 'bridge' / 'stream-download-bridge.py'
    proc = subprocess.Popen([sys.executable, str(script), '--port', str(STREAM_BRIDGE_PORT)], cwd=EXTENSION,
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == 'win32' else 0)
    processes.append(proc)
    deadline = time.monotonic() + 5
    while not bridge_stop.is_set() and time.monotonic() < deadline:
        if healthy():
            print(f'本机流式下载桥接已就绪 127.0.0.1:{STREAM_BRIDGE_PORT}')
            return
        if proc.poll() is not None:
            break
        bridge_stop.wait(.1)
    if proc.poll() is None:
        proc.terminate()
        proc.wait(timeout=3)
    raise RuntimeError(f'本机下载桥接启动失败，请检查 Python 和端口 {STREAM_BRIDGE_PORT}。')


def monitor_stream_bridge(stop_event: threading.Event, interval: float = 3) -> None:
    """启动时复用的桥接也可能被其原启动者关闭，运行期间持续补回。"""
    while not stop_event.wait(interval):
        try:
            start_stream_bridge()
        except (OSError, RuntimeError) as error:
            if not stop_event.is_set():
                print(f'本机下载桥接恢复失败，稍后重试：{error}')


if __name__ == "__main__":
    main()
