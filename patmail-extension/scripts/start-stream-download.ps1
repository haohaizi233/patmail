# Compatibility for existing Windows Scheduled Tasks. The implementation lives under download/bridge.
& (Join-Path $PSScriptRoot 'download/bridge/start-stream-download.ps1') @args
exit $LASTEXITCODE
