$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = 9222

# Claude 5.x 打包版检测到 --remote-debugging-port 会输出 "refusing to start" 并退出。
# 先判断版本再做任何清理，避免白白结束正在用的 Claude。
$latest = Get-ChildItem (Join-Path $env:LOCALAPPDATA 'ClaudeSkinned') -Directory -Filter 'app-*' |
  Sort-Object { [version]($_.Name -replace '^app-', '') } -Descending | Select-Object -First 1
if ($latest -and [int](($latest.Name -replace '^app-', '').Split('.')[0]) -ge 5) {
  Write-Host "当前副本 $($latest.Name) 不接受调试端口参数，此脚本只适用于 4.x 及更早的副本。"
  exit 1
}

Write-Host '[1/4] 清理 ClaudeSkinned 里的 claude.exe ...'
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'stop-original-claude.ps1')

Write-Host '[2/4] 确认主题守护进程 (9343) ...'
$ok = $false
try { Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:9343/api/status' -TimeoutSec 3 | Out-Null; $ok = $true } catch {}
if (-not $ok) {
  $env:CDT_CLAUDE_ROOT = Join-Path $env:LOCALAPPDATA 'ClaudeSkinned'
  $node = (Get-Command node -ErrorAction Stop).Source
  Start-Process -FilePath $node -ArgumentList ('"' + (Join-Path $root 'src\daemon.mjs') + '"') -WindowStyle Hidden
  Start-Sleep -Seconds 3
}

Write-Host '[3/4] 带调试端口启动 Claude ...'
$app = Get-ChildItem (Join-Path $env:LOCALAPPDATA 'ClaudeSkinned') -Directory -Filter 'app-*' | Sort-Object Name -Descending | Select-Object -First 1
$exe = Join-Path $app.FullName 'claude.exe'
if (-not (Test-Path $exe)) { throw "找不到 $exe" }
Start-Process -FilePath $exe -ArgumentList "--remote-debugging-port=$port","--remote-debugging-address=127.0.0.1"

Write-Host '[4/4] 等待调试端口 ...'
for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Seconds 1
  try { $v = Invoke-RestMethod -Uri "http://127.0.0.1:$port/json/version" -TimeoutSec 2; Write-Host "调试端口已就绪: $($v.Browser)"; exit 0 } catch {}
}
Write-Host '30 秒内调试端口没起来，请把上面的输出贴给心酱'
exit 1
