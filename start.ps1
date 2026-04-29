
try {
    $interfaceIndex = (Get-NetRoute -DestinationPrefix '0.0.0.0/0' | Sort-Object -Property RouteMetric | Select-Object -First 1).InterfaceIndex
    
    $ip = (Get-NetIPAddress -InterfaceIndex $interfaceIndex -AddressFamily IPv4 -ErrorAction Stop | Select-Object -First 1).IPAddress
} catch {
    $ip = $null
}

if (-not $ip) {
    Write-Host -ForegroundColor Red "FATAL: Could not automatically determine the local network IP address. Please check your network connection."
    Read-Host -Prompt "Press Enter to exit"
    exit 1
}

$env:VITE_PUBLIC_URL = $ip

Write-Host -ForegroundColor Green "Found Host IP: $env:VITE_PUBLIC_URL. Starting Docker services..."

docker-compose up -d --build

Write-Host -ForegroundColor Green "Found Host IP: $env:VITE_PUBLIC_URL."
