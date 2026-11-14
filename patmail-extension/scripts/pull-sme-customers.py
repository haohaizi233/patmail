"""拉一份中小客户名单快照到 public/assets/sme-customers.json。

中小客户的 GetCustomerlist 接口有三万多家，响应要二三十分钟，插件走不过来。
这个脚本从备份数据库 IPEasy-X 直读客户编号和名称，写成静态快照打包进扩展。

用法（密码只从环境变量读，不写进脚本和仓库）：

    set DB_PWD=...
    python scripts/pull-sme-customers.py

跑完重新构建扩展，快照就是新的。客户管理里的「重新读取」在中小客户模式下只会重读这份文件。
"""

from __future__ import annotations

import json
import os
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pymssql

SERVER = "183.36.43.66"
PORT = "8097"
DATABASE = "IPEasy-X"
USER = "sa"
# 两份快照保持同步：public/assets 由 Vite 复制到 dist/assets，运行时通过
# manifest 声明的固定扩展资源地址读取；src/assets 保留同一份源快照。
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "public" / "assets" / "sme-customers.json"
BUNDLED_OUT = ROOT / "patmail-extension" / "src" / "assets" / "sme-customers.json"


def write_snapshot(out: Path, text: str) -> None:
    """先写临时文件再原子替换：中途失败不会把旧快照截成半截。

    直接 write_text 打开目标文件时，Windows 上偶尔被别的进程占着（构建、杀软扫描），
    报的错还五花八门（实测见过 Errno 22 Invalid argument），所以失败就退避重试几次。
    """
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_name(out.name + ".tmp")
    last: OSError | None = None
    for attempt in range(5):
        try:
            tmp.write_text(text, encoding="utf-8")
            os.replace(tmp, out)
            return
        except OSError as error:
            last = error
            time.sleep(0.5 * (attempt + 1))
    raise OSError(f"写 {out} 失败（重试 5 次）：{last}") from last


def main() -> int:
    password = os.environ.get("DB_PWD", "")
    if not password:
        print("缺 DB_PWD 环境变量（数据库 sa 密码）。不在脚本里存密码。")
        return 1
    try:
        conn = pymssql.connect(
            server=SERVER,
            port=PORT,
            user=USER,
            password=password,
            database=DATABASE,
            timeout=30,
            login_timeout=15,
            tds_version="7.0",
            charset="utf8",
        )
    except Exception as error:
        print(f"连接中小客户备份数据库 ({SERVER}:{PORT}) 失败（网络超时或未在指定内网环境）：{error}")
        return 1
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT customer_id, customer_name FROM dbo.c_customer "
            "WHERE customer_name IS NOT NULL AND customer_name <> '' "
            "ORDER BY customer_name"
        )
        rows = cur.fetchall()
    finally:
        conn.close()
    customers = [[str(row[0]).strip(), str(row[1]).strip()] for row in rows]
    taken = datetime.now(timezone(timedelta(hours=8))).isoformat(timespec="seconds")
    text = json.dumps(
        {"takenAt": taken, "count": len(customers), "customers": customers},
        ensure_ascii=False,
        separators=(",", ":"),
    )
    for target in (OUT, BUNDLED_OUT):
        write_snapshot(target, text)
    print(f"已写 {OUT} 和 {BUNDLED_OUT}：{len(customers)} 家，{OUT.stat().st_size // 1024} KB，快照时间 {taken}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
