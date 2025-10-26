// ═══════════════════════════════════════════════════════════
// SYSTEM.JS - System dashboard interactivity
// ═══════════════════════════════════════════════════════════

const pingBtn = document.getElementById('pingBtn');
const pingResult = document.getElementById('pingResult');

pingBtn.addEventListener('click', async () => {
  pingBtn.disabled = true;
  pingBtn.textContent = 'Pinging...';
  pingResult.textContent = '...';
  
  const clientStart = performance.now();
  
  try {
    const res = await fetch('/latency/ping');
    const clientEnd = performance.now();
    const data = await res.json();
    
    const roundTrip = (clientEnd - clientStart).toFixed(2);
    const serverMs = data.serverMs || 0;
    
    pingResult.textContent = `${roundTrip}ms (server: ${serverMs}ms)`;
    pingResult.className = 'text-2xl font-mono text-green-600';
    
  } catch (err) {
    pingResult.textContent = 'Error';
    pingResult.className = 'text-2xl font-mono text-red-600';
  }
  
  pingBtn.disabled = false;
  pingBtn.textContent = 'Ping Server';
});
