param([switch]$InspectOnly)
$ErrorActionPreference = 'Stop'

function Test-OriginalClaudeDesktop {
  param([string]$Executable, [string[]]$Roots)
  if (-not $Executable -or [IO.Path]::GetFileName($Executable) -ine 'claude.exe') { return $false }
  foreach ($install in $Roots) {
    if ($install -and $Executable.StartsWith($install.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) { return $true }
  }
  return $false
}

# 只接受原版桌面程序的安装目录，不按进程名或父子关系批量结束。
$roots = @(
  (Join-Path $env:LOCALAPPDATA 'Claude'),
  (Join-Path $env:LOCALAPPDATA 'AnthropicClaude'),
  (Join-Path $env:LOCALAPPDATA 'Programs\Claude'),
  # 换肤副本：不清理它，单实例锁会让新启动的 claude.exe（含调试端口参数）被吞掉
  (Join-Path $env:LOCALAPPDATA 'ClaudeSkinned')
)
$roots += @(Get-AppxPackage -Name Claude | ForEach-Object { $_.InstallLocation } | Where-Object { $_ })
$stopped = 0
for ($attempt = 0; $attempt -lt 4; $attempt++) {
  $targets = @(Get-CimInstance Win32_Process -Filter "name='claude.exe'" | Where-Object {
    Test-OriginalClaudeDesktop -Executable $_.ExecutablePath -Roots $roots
  })
  if ($InspectOnly) {
    [pscustomobject]@{ Targets = @($targets | Select-Object ProcessId, ExecutablePath); Count = $targets.Count } | ConvertTo-Json -Depth 4 -Compress
    return
  }
  if ($targets.Count -eq 0) { [pscustomobject]@{Stopped=$stopped;Remaining=0} | ConvertTo-Json -Compress; return }
  foreach ($target in $targets) {
    # PID 可能被系统复用，结束前重新核对进程身份。
    $current = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $target.ProcessId)
    if ($current -and $current.ExecutablePath -ieq $target.ExecutablePath -and
        $current.CreationDate -eq $target.CreationDate -and $current.CommandLine -ceq $target.CommandLine) {
      try { Stop-Process -Id $current.ProcessId -Force -ErrorAction Stop; $stopped++ }
      catch { if (Get-Process -Id $target.ProcessId -ErrorAction SilentlyContinue) { throw } }
    }
  }
  Start-Sleep -Milliseconds 300
}
throw '原版 Claude 桌面进程仍在运行，自动清理未完成；请查看 launch.log。'
