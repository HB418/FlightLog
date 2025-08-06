document.addEventListener('DOMContentLoaded', function() {
  const userName = localStorage.getItem('userName');
  const welcomeModal = document.getElementById('welcome-modal');
  const saveNameBtn = document.getElementById('save-name-btn');
  const nameInput = document.getElementById('name-input');
  const controlsSection = document.getElementById('controls-section');

  function showWelcomeMessage(name) {
    let welcomeDiv = document.getElementById('welcome-message');
    if (!welcomeDiv) {
      welcomeDiv = document.createElement('div');
      welcomeDiv.id = 'welcome-message';
      welcomeDiv.className = 'welcome-message';
      welcomeDiv.style.padding = '0.5rem';
      welcomeDiv.style.fontSize = '1.2rem';
      welcomeDiv.style.color = 'var(--teal)';
      controlsSection.parentNode.insertBefore(welcomeDiv, controlsSection);
    }
    welcomeDiv.textContent = `Welcome, ${name}!`;
  }

  if (!userName) {
    welcomeModal.classList.add('active');
  } else {
    showWelcomeMessage(userName);
  }

  saveNameBtn.addEventListener('click', () => {
    const name = nameInput.value.trim();
    if (name) {
      localStorage.setItem('userName', name);
      welcomeModal.classList.remove('active');
      showWelcomeMessage(name);
    }
  
  // Clear Name Confirmation Modal logic
  const clearNameBtn = document.getElementById('clear-name-btn');
  const clearNameModal = document.getElementById('clear-name-modal');
  const cancelClearBtn = document.getElementById('cancel-clear-name-btn');
  const confirmClearBtn = document.getElementById('confirm-clear-name-btn');

  if (clearNameBtn && clearNameModal) {
    clearNameBtn.addEventListener('click', () => {
      clearNameModal.classList.add('active');
    });
    cancelClearBtn.addEventListener('click', () => {
      clearNameModal.classList.remove('active');
    });
    confirmClearBtn.addEventListener('click', () => {
      localStorage.removeItem('userName');
      clearNameModal.classList.remove('active');
      location.reload();
    });
  }

});

  // Clear Name Confirmation Modal logic
  const clearNameBtn = document.getElementById('clear-name-btn');
  const clearNameModal = document.getElementById('clear-name-modal');
  const cancelClearBtn = document.getElementById('cancel-clear-name-btn');
  const confirmClearBtn = document.getElementById('confirm-clear-name-btn');

  if (clearNameBtn && clearNameModal) {
    clearNameBtn.addEventListener('click', () => {
      clearNameModal.classList.add('active');
    });
    cancelClearBtn.addEventListener('click', () => {
      clearNameModal.classList.remove('active');
    });
    confirmClearBtn.addEventListener('click', () => {
      localStorage.removeItem('userName');
      clearNameModal.classList.remove('active');
      location.reload();
    });
  }

});
