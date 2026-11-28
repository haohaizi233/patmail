$ErrorActionPreference = 'Stop'
$taskLegacyBridge = $false
try {
    $taskBridgeHealth = Invoke-RestMethod 'http://127.0.0.1:42843/health' -TimeoutSec 2
    if ($taskBridgeHealth.protocol -eq 'patmail-stream-v1' -and $taskBridgeHealth.version -eq 2 -and $taskBridgeHealth.features -contains 'metadata-journal') {
        Write-Output 'PatMail 本机下载桥接已运行。'
        exit 0
    }
    if ($taskBridgeHealth.protocol -eq 'patmail-stream-v1') { $taskLegacyBridge = $true }
} catch { }
if ($taskLegacyBridge) { throw '检测到旧版下载桥接。请先暂停当前下载，再关闭旧版 start.py 或旧桥接进程并重新启动，以启用增量缓存。' }
$taskPython = (Get-Command python -ErrorAction Stop).Source
$taskBridgeScript = Join-Path $PSScriptRoot 'stream-download-bridge.py'
Start-Process -FilePath $taskPython -ArgumentList @('"' + $taskBridgeScript + '"') -WindowStyle Hidden
for ($taskAttempt = 0; $taskAttempt -lt 20; $taskAttempt++) {
    Start-Sleep -Milliseconds 200
    try {
        $taskBridgeHealth = Invoke-RestMethod 'http://127.0.0.1:42843/health' -TimeoutSec 2
        if ($taskBridgeHealth.protocol -eq 'patmail-stream-v1' -and $taskBridgeHealth.version -eq 2 -and $taskBridgeHealth.features -contains 'metadata-journal') {
            Write-Output 'PatMail 本机下载桥接已启动，仅监听 127.0.0.1:42843。'
            exit 0
        }
    } catch { }
}
throw '本机下载桥接未启动，请检查 Python 和端口 42843。'
