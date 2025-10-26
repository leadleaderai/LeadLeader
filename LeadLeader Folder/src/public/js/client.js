// ═══════════════════════════════════════════════════════════
// CLIENT.JS - Browser-side utilities and enhancements
// ═══════════════════════════════════════════════════════════

(function() {
  'use strict';

  // ───────────────────────────────────────────────
  // Utility: Show toast notifications
  // ───────────────────────────────────────────────
  window.showToast = function(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `fixed top-4 right-4 px-6 py-3 rounded-lg shadow-lg z-50 fade-in ${
      type === 'success' ? 'bg-green-500 text-white' :
      type === 'error' ? 'bg-red-500 text-white' :
      type === 'warning' ? 'bg-yellow-500 text-white' :
      'bg-blue-500 text-white'
    }`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-20px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  };

  // ───────────────────────────────────────────────
  // Utility: Format bytes to human readable
  // ───────────────────────────────────────────────
  window.formatBytes = function(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  // ───────────────────────────────────────────────
  // Utility: Debounce function calls
  // ───────────────────────────────────────────────
  window.debounce = function(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  };

  // ───────────────────────────────────────────────
  // Feature: Smooth scroll to anchors
  // ───────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
      anchor.addEventListener('click', function(e) {
        const href = this.getAttribute('href');
        if (href === '#') return;
        
        e.preventDefault();
        const target = document.querySelector(href);
        if (target) {
          target.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
          });
        }
      });
    });
  });

  // ───────────────────────────────────────────────
  // Feature: Form validation helpers
  // ───────────────────────────────────────────────
  window.validateEmail = function(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  // ───────────────────────────────────────────────
  // Feature: Copy to clipboard
  // ───────────────────────────────────────────────
  window.copyToClipboard = async function(text) {
    try {
      await navigator.clipboard.writeText(text);
      showToast('Copied to clipboard!', 'success');
      return true;
    } catch (err) {
      showToast('Failed to copy', 'error');
      return false;
    }
  };

  // ───────────────────────────────────────────────
  // Feature: Detect browser capabilities
  // ───────────────────────────────────────────────
  window.checkBrowserSupport = function() {
    const support = {
      mediaRecorder: 'MediaRecorder' in window,
      getUserMedia: 'mediaDevices' in navigator && 'getUserMedia' in navigator.mediaDevices,
      audioContext: 'AudioContext' in window || 'webkitAudioContext' in window,
      fetch: 'fetch' in window,
      localStorage: 'localStorage' in window
    };
    
    return support;
  };

  // ───────────────────────────────────────────────
  // Placeholder: Future AI assistant integration
  // ───────────────────────────────────────────────
  /**
   * Future feature: On-site AI assistant
   * 
   * Planned functionality:
   *  - Floating chat widget
   *  - Context-aware help based on current page
   *  - Voice commands for navigation
   *  - Real-time transcription preview
   *  - Quick actions (e.g., "Start recording", "Check status")
   * 
   * Implementation: Will use WebSocket for real-time communication
   */
  window.initAIAssistant = function() {
    console.log('[ai-assist] AI Assistant feature coming in v0.3');
    // TODO: Implement in future version
  };

  // ───────────────────────────────────────────────
  // Feature: Performance monitoring (basic)
  // ───────────────────────────────────────────────
  if (window.performance && window.performance.timing) {
    window.addEventListener('load', () => {
      setTimeout(() => {
        const perfData = window.performance.timing;
        const pageLoadTime = perfData.loadEventEnd - perfData.navigationStart;
        console.log(`[performance] Page load time: ${pageLoadTime}ms`);
      }, 0);
    });
  }

  // ───────────────────────────────────────────────
  // Feature: Console branding
  // ───────────────────────────────────────────────
  console.log('%c🎙️ LeadLeader Platform v0.1 (beta)', 'color: #007bff; font-size: 16px; font-weight: bold;');
  console.log('%cAI-powered call assistant & automation platform', 'color: #666; font-size: 12px;');
  console.log('%cInterested in our API? Visit /docs', 'color: #007bff; font-size: 12px;');

})();
