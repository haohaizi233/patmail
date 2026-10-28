# C drive cleanup script (temp files and caches only)
$ErrorActionPreference = 'SilentlyContinue'
$before = (Get-PSDrive C).Free

function Clear-Target {
    param([string]$Path, [string]$Label)
    if (-not (Test-Path $Path)) { return }
    $sum = 0
    Get-ChildItem $Path -Force | ForEach-Object {
        if ($_.PSIsContainer) {
            $sum += (Get-ChildItem $_.FullName -Recurse -Force | Measure-Object Length -Sum).Sum
            Remove-Item $_.FullName -Recurse -Force
        } else {
            $sum += $_.Length
            Remove-Item $_.FullName -Force
        }
    }
    "{0,-38} {1,10:N1} MB freed" -f $Label, ($sum/1MB)
}

"=== Cleanup start ==="
Clear-Target "$env:LOCALAPPDATA\Temp" "User Temp"
Clear-Target "C:\Windows\Temp" "Windows Temp"
Clear-Target "C:\Windows\SoftwareDistribution\Download" "Windows Update cache"
Clear-Target "$env:LOCALAPPDATA\npm-cache\_cacache" "npm cache (_cacache)"
Clear-Target "$env:LOCALAPPDATA\npm-cache\_logs" "npm cache logs"
Clear-Target "$env:LOCALAPPDATA\pip\cache" "pip cache"
Clear-Target "$env:LOCALAPPDATA\Google\Chrome\User Data\Default\Cache" "Chrome cache"
Clear-Target "$env:LOCALAPPDATA\Google\Chrome\User Data\Default\Code Cache" "Chrome Code Cache"
Clear-Target "$env:LOCALAPPDATA\Microsoft\Edge\User Data\Default\Cache" "Edge cache"
Clear-Target "$env:LOCALAPPDATA\Microsoft\Edge\User Data\Default\Code Cache" "Edge Code Cache"
Clear-Target "$env:LOCALAPPDATA\CrashDumps" "Crash dumps"
Clear-Target "$env:LOCALAPPDATA\Microsoft\Windows\WER\ReportArchive" "WER report archive"
Clear-Target "$env:LOCALAPPDATA\Microsoft\Windows\WER\ReportQueue" "WER report queue"

# Codex runtime previous-version backups (keep current codex-primary-runtime)
$rt = "$env:USERPROFILE\.cache\codex-runtimes"
if (Test-Path $rt) {
    $sum = 0
    Get-ChildItem $rt -Force -Directory | Where-Object { $_.Name -like '*previous*' } | ForEach-Object {
        $sum += (Get-ChildItem $_.FullName -Recurse -Force | Measure-Object Length -Sum).Sum
        Remove-Item $_.FullName -Recurse -Force
    }
    "{0,-38} {1,10:N1} MB freed" -f "codex-runtimes old backups", ($sum/1MB)
}

$after = (Get-PSDrive C).Free
""
"=== Cleanup done ==="
"Space freed : {0:N2} GB" -f (($after - $before)/1GB)
"C: free now : {0:N2} GB (was {1:N2} GB)" -f ($after/1GB), ($before/1GB)
