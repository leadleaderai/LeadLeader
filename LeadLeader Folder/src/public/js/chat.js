// ═══════════════════════════════════════════════════════════
// CHAT.JS - Chat demo client
// ═══════════════════════════════════════════════════════════

const messagesDiv = document.getElementById('messages');
const chatForm = document.getElementById('chatForm');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const cooldownBanner = document.getElementById('cooldownBanner');
const cooldownSeconds = document.getElementById('cooldownSeconds');

let cooldownTimer = null;

// Add message to chat
function addMessage(text, isUser) {
  const msgDiv = document.createElement('div');
  msgDiv.className = `flex ${isUser ? 'justify-end' : 'justify-start'}`;
  
  const bubble = document.createElement('div');
  bubble.className = `max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
    isUser 
      ? 'bg-blue-600 text-white' 
      : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white'
  }`;
  bubble.textContent = text;
  
  msgDiv.appendChild(bubble);
  messagesDiv.appendChild(msgDiv);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Show cooldown countdown
function showCooldown(seconds) {
  if (cooldownTimer) clearInterval(cooldownTimer);
  
  let remaining = seconds;
  cooldownSeconds.textContent = remaining;
  cooldownBanner.classList.remove('hidden');
  sendBtn.disabled = true;
  
  cooldownTimer = setInterval(() => {
    remaining--;
    if (remaining <= 0) {
      clearInterval(cooldownTimer);
      cooldownBanner.classList.add('hidden');
      sendBtn.disabled = false;
    } else {
      cooldownSeconds.textContent = remaining;
    }
  }, 1000);
}

// Handle form submission
chatForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const message = messageInput.value.trim();
  if (!message) return;
  
  // Add user message
  addMessage(message, true);
  messageInput.value = '';
  sendBtn.disabled = true;
  
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    });
    
    const data = await res.json();
    
    if (!res.ok) {
      if (res.status === 429) {
        // Rate limited
        const retryAfter = data.retryAfter || 5;
        showCooldown(retryAfter);
        addMessage(`⏱️ Rate limit reached. Please wait ${retryAfter} seconds.`, false);
      } else {
        addMessage(`❌ Error: ${data.error || 'Unknown error'}`, false);
        sendBtn.disabled = false;
      }
      return;
    }
    
    // Add bot reply
    addMessage(data.reply, false);
    sendBtn.disabled = false;
    
  } catch (err) {
    addMessage('❌ Network error. Please try again.', false);
    sendBtn.disabled = false;
  }
});
