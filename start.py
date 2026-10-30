"""PatMail 一键启动。

启动当前仓库里的本地服务，并在结束时一起关掉。

- 插件：每次启动先在 patmail-extension 执行一次生产构建，结果写入 dist
- 管理端原型：项目根目录的 Vite，地址 5173
- 插件工作台是 dist 里的扩展页面，不另开本地端口
- 下载由扩展在浏览器内完成，此开发启动器不启动下载桥接
"""

from __future__ import annotations

import functools
import os
import re
import shutil
import signal
import socket
import subprocess
import sys
import threading
import time
import webbrowser
import urllib.request
import json
from collections import deque
from pathlib import Path

ROOT = Path(__file__).resolve().parent
FRONTEND_PORT = 5173
FRONTEND_URL = f"http://127.0.0.1:{FRONTEND_PORT}"
EXTENSION = ROOT / "patmail-extension"
STREAM_BRIDGE_PORT = 42843

processes: list[subprocess.Popen[str]] = []
stopping = False
bridge_stop = threading.Event()
print = functools.partial(print, flush=True)
recent_output: deque[str] = deque(maxlen=200)


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


def ensure_frontend(runner: str) -> None:
    vite_js = ROOT / "node_modules" / "vite" / "bin" / "vite.js"
    if vite_js.is_file():
        return
    print("管理端依赖不完整，正在按锁文件恢复...")
    # 只恢复根目录管理端。不能把插件目录算进这次安装，否则会改写锁文件。
    result = subprocess.run(
        [runner, "install", "--frozen-lockfile", "--ignore-workspace"],
        cwd=ROOT,
        env=tool_env(),
        check=False,
    )
    if result.returncode != 0 or not vite_js.is_file():
        fail("管理端依赖恢复失败。请在项目根目录查看 pnpm install 的输出。")


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


ANSI_ESCAPE_RE = re.compile(r"\x1b\[[0-?]*[ -/]*[@-~]")
VITE_LOCAL_URL_RE = re.compile(r"\bLocal\s*:\s*https?://\S+", re.IGNORECASE)


def is_vite_local_url(line: str) -> bool:
    """识别 Vite Local 地址；先移除色码，避免样式重置码打断标签。"""
    return bool(VITE_LOCAL_URL_RE.search(ANSI_ESCAPE_RE.sub("", line)))


def pipe_output(proc: subprocess.Popen[str], ready: threading.Event) -> None:
    if proc.stdout is None:
        return
    for line in proc.stdout:
        recent_output.append(line)
        if is_vite_local_url(line):
            ready.set()
        try:
            print(line, end="")
        except UnicodeEncodeError:
            print(line.encode("utf-8", "replace").decode("utf-8"), end="")

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
        fail(f"插件编译失败，退出码 {build.returncode}。管理端没有启动。")
    print("插件编译完成。若 Chrome 已加载该扩展，请在扩展管理页重新加载。")
    print()


def start_logged(runner: str, args: list[str], cwd: Path) -> subprocess.Popen[str]:
    proc = subprocess.Popen(
        [runner, *args],
        cwd=cwd,
        env=tool_env(),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
        bufsize=1,
    )
    processes.append(proc)
    return proc


def port_in_use(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        try:
            probe.bind(("127.0.0.1", port))
        except OSError:
            return True
    return False


def port_owners(port: int) -> list[tuple[int, str]]:
    """监听该端口的进程（PID，进程名）。非 Windows 直接返回空，退化为只报端口状态。"""
    if sys.platform != "win32":
        return []
    listing = subprocess.run(
        ["netstat", "-ano", "-p", "TCP"],
        capture_output=True, text=True, errors="replace", check=False,
    )
    pids: list[int] = []
    for line in listing.stdout.splitlines():
        parts = line.split()
        if (
            len(parts) >= 5
            and parts[0].upper() == "TCP"
            and parts[3].upper() == "LISTENING"
            and parts[1].rsplit(":", 1)[-1] == str(port)
        ):
            pid = int(parts[4])
            if pid not in pids:
                pids.append(pid)
    owners: list[tuple[int, str]] = []
    for pid in pids:
        name = "未知进程"
        task = subprocess.run(
            ["tasklist", "/FI", f"PID eq {pid}", "/FO", "CSV", "/NH"],
            capture_output=True, text=True, errors="replace", check=False,
        )
        first = task.stdout.splitlines()[0] if task.stdout.strip() else ""
        if first.startswith('"'):
            name = first.split('","', 1)[0].strip('"')
        owners.append((pid, name))
    return owners


def process_command_line(pid: int) -> str:
    if sys.platform != "win32":
        return ""
    result = subprocess.run(
        ["powershell", "-NoProfile", "-Command", f"(Get-CimInstance Win32_Process -Filter 'ProcessId={pid}').CommandLine"],
        capture_output=True, text=True, errors="replace", check=False,
    )
    return result.stdout.strip()


def is_ours(pid: int) -> bool:
    """命令行里带着本项目路径，就是上次没退干净的残留进程。"""
    return str(ROOT).lower() in process_command_line(pid).lower()


def kill_pid(pid: int) -> None:
    if sys.platform == "win32":
        subprocess.run(
            ["taskkill", "/F", "/T", "/PID", str(pid)],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False,
        )
    else:
        try:
            os.kill(pid, 15)
        except OSError:
            pass


def wait_port_free(port: int, timeout: float = 5.0) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if not port_in_use(port):
            return True
        time.sleep(0.2)
    return port_in_use(port) is False


def reclaim_frontend_port() -> None:
    """端口预检：本项目残留进程直接清掉，别的程序占用就把话说清楚再退出。"""
    if not port_in_use(FRONTEND_PORT):
        return
    owners = port_owners(FRONTEND_PORT)
    ours = [(pid, name) for pid, name in owners if is_ours(pid)]
    if ours:
        for pid, name in ours:
            print(f"端口 {FRONTEND_PORT} 被上一次的残留进程占用（{name}，PID {pid}），自动清理...")
            kill_pid(pid)
        if wait_port_free(FRONTEND_PORT):
            return
    if not port_in_use(FRONTEND_PORT):
        return
    remaining = port_owners(FRONTEND_PORT)
    detail = "、".join(f"{name}（PID {pid}）" for pid, name in remaining) or "未知进程"
    fail(
        f"端口 {FRONTEND_PORT} 被占用：{detail}。\n"
        f"这是别的程序，不会自动结束它。请先关闭它，或改 start.py 里的 FRONTEND_PORT 后重试。"
    )


def http_ready(url: str, timeout: float = 5.0) -> bool:
    """探活。首次请求 Vite 要做依赖预构建，超时给宽一点。"""
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with opener.open(url, timeout=timeout) as response:
            return response.status < 500
    except OSError:
        return False


DEPENDENCY_ERROR_TOKENS = ("ERR_MODULE_NOT_FOUND", "Cannot find package", "Cannot find module", "ERR_PACKAGE_PATH")
PORT_ERROR_TOKENS = ("EADDRINUSE", "already in use", "address already in use")


def output_has(tokens: tuple[str, ...]) -> bool:
    return any(token in line for line in recent_output for token in tokens)


def recoverable_failure() -> bool:
    """依赖损坏或端口冲突都可以自动修一次再试。"""
    return output_has(DEPENDENCY_ERROR_TOKENS) or output_has(PORT_ERROR_TOKENS)


def repair_frontend(runner: str) -> None:
    if output_has(DEPENDENCY_ERROR_TOKENS):
        print("管理端依赖损坏（缺包），正在按锁文件自动修复...")
        result = subprocess.run(
            [runner, "install", "--frozen-lockfile", "--ignore-workspace"],
            cwd=ROOT,
            env=tool_env(),
            check=False,
        )
        if result.returncode != 0:
            fail("管理端依赖自动修复失败。请在项目根目录手动运行 pnpm install 查看原因。")
        print("依赖修复完成，重试启动。")
    else:
        print("端口疑似被残留进程占用，清理后重试启动...")


def frontend_failure_message(returncode: int | None) -> str:
    lines = [f"管理端启动失败，退出码 {returncode}。"]
    owners = port_owners(FRONTEND_PORT)
    if owners:
        detail = "、".join(f"{name}（PID {pid}）" for pid, name in owners)
        lines.append(f"端口 {FRONTEND_PORT} 当前被占用：{detail}。")
        if any(is_ours(pid) for pid, _ in owners):
            lines.append("占用者是本项目的残留进程，再运行一次 start.py 会自动清理。")
        else:
            lines.append(f"请先关闭占用该端口的程序，或改 start.py 里的 FRONTEND_PORT（当前 {FRONTEND_PORT}）。")
    else:
        lines.append(f"端口 {FRONTEND_PORT} 当前空闲，问题更可能出在依赖或 Vite 配置。")
    tail = [line.rstrip() for line in recent_output if line.strip()][-15:]
    if tail:
        lines.append("管理端最近输出：")
        lines.extend(f"  {line}" for line in tail)
    return "\n".join(lines)


def start_frontend(runner: str) -> subprocess.Popen[str]:
    if not (ROOT / "package.json").is_file():
        fail("项目根目录没有 package.json，无法启动管理端。")
    ensure_frontend(runner)
    reclaim_frontend_port()
    return start_logged(
        runner,
        ["exec", "vite", "--host", "127.0.0.1", "--port", str(FRONTEND_PORT), "--strictPort"],
        ROOT,
    )


def wait_for_ready_or_exit(
    proc: subprocess.Popen[str], ready: threading.Event, timeout: float
) -> bool:
    """等待地址日志或 Vite 退出，避免已退出的进程空等完整启动时限。"""
    deadline = time.monotonic() + timeout
    while not ready.is_set():
        if proc.poll() is not None:
            return False
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            return False
        ready.wait(timeout=min(0.1, remaining))
    return True


def start_frontend_with_recovery(runner: str) -> subprocess.Popen[str]:
    """带容灾的启动：端口预检、失败自动修复重试一次、就绪用 HTTP 探活。"""
    for attempt in (1, 2):
        recent_output.clear()
        frontend = start_frontend(runner)
        ready = threading.Event()
        output_reader = threading.Thread(target=pipe_output, args=(frontend, ready), daemon=True)
        output_reader.start()
        if wait_for_ready_or_exit(frontend, ready, timeout=40) and frontend.poll() is None:
            deadline = time.monotonic() + 20
            while time.monotonic() < deadline and not http_ready(FRONTEND_URL):
                time.sleep(0.5)
            if http_ready(FRONTEND_URL):
                webbrowser.open(FRONTEND_URL)
            else:
                print(f"管理端进程在跑，但 {FRONTEND_URL} 暂时探不通，请看上方日志。")
            return frontend
        if frontend.poll() is None:
            print("管理端还没有打印访问地址，请查看上方日志。")
            return frontend
        output_reader.join(timeout=1)
        if attempt == 1 and recoverable_failure():
            repair_frontend(runner)
            continue
        fail(frontend_failure_message(frontend.returncode))
    raise AssertionError("unreachable")


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
    print(f"管理端原型  {FRONTEND_URL}")
    print(f"插件目录    {EXTENSION / 'dist'}")
    print("每次启动都会先编译插件。工作台跟着扩展走：在 Chrome 里点 PatMail 图标，或在 EASY 页面点「打开工作台」。")
    print("按 Ctrl+C 停止。")
    print()

    build_extension(runner)
    frontend = start_frontend_with_recovery(runner)
    code = frontend.wait()
    stop()
    raise SystemExit(code)


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
    script = EXTENSION / 'scripts' / 'stream-download-bridge.py'
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
