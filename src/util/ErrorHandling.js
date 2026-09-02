if (!document.getElementById('modal-animations')) {
  const style = document.createElement('style');
  style.id = 'modal-animations';
  style.innerHTML = `
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes slideDown { from { transform: translateY(-20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
  `;
  document.head.appendChild(style);
}

export function showErrorModal(message, title = "Invalid Connection") {
  const overlay = document.createElement('div');
  overlay.style.position = 'fixed';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.width = '100vw';
  overlay.style.height = '100vh';
  overlay.style.backgroundColor = 'rgba(15, 23, 42, 0.05)';
  overlay.style.backdropFilter = 'blur(2px)';
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.zIndex = '10000';
  overlay.style.animation = 'fadeIn 0.2s ease-out';

  const modal = document.createElement('div');
  modal.style.backgroundColor = '#ffffff';
  modal.style.borderRadius = '8px';
  modal.style.boxShadow = '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)';
  modal.style.width = '100%';
  modal.style.maxWidth = '400px';
  modal.style.overflow = 'hidden';
  modal.style.fontFamily = 'sans-serif';
  modal.style.transform = 'translateY(-20px)';
  modal.style.animation = 'slideDown 0.3s ease-out forwards';

  const topBar = document.createElement('div');
  topBar.style.height = '4px';
  modal.appendChild(topBar);

  const content = document.createElement('div');
  content.style.padding = '24px';
  
  const header = document.createElement('h3');
  header.innerText = `⚠️ ${title}`;
  header.style.margin = '0 0 12px 0';
  header.style.color = '#0f172a';
  header.style.fontSize = '18px';
  header.style.fontWeight = '600';
  
  const body = document.createElement('p');
  body.innerText = message;
  body.style.margin = '0 0 24px 0';
  body.style.color = '#475569';
  body.style.fontSize = '14px';
  body.style.lineHeight = '1.5';
  body.style.whiteSpace = 'pre-line'; 

  const buttonContainer = document.createElement('div');
  buttonContainer.style.display = 'flex';
  buttonContainer.style.justifyContent = 'flex-end';

  const closeBtn = document.createElement('button');
  closeBtn.innerText = 'Got it';
  closeBtn.style.backgroundColor = '#f1f5f9';
  closeBtn.style.color = '#0f172a';
  closeBtn.style.border = 'none';
  closeBtn.style.padding = '8px 16px';
  closeBtn.style.borderRadius = '6px';
  closeBtn.style.fontSize = '14px';
  closeBtn.style.fontWeight = '500';
  closeBtn.style.cursor = 'pointer';
  closeBtn.style.transition = 'background-color 0.2s';
  
  closeBtn.onmouseenter = () => closeBtn.style.backgroundColor = '#e2e8f0';
  closeBtn.onmouseleave = () => closeBtn.style.backgroundColor = '#f1f5f9';

  const closeModal = () => {
    overlay.style.opacity = '0';
    setTimeout(() => overlay.remove(), 200); 
  };

  closeBtn.onclick = closeModal;
  overlay.onclick = (e) => {
    if (e.target === overlay) closeModal(); 
  };

  buttonContainer.appendChild(closeBtn);
  content.appendChild(header);
  content.appendChild(body);
  content.appendChild(buttonContainer);
  modal.appendChild(content);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}

export function showConfirmationModal(message, title, onConfirm) {
  const overlay = document.createElement('div');
  overlay.style.position = 'fixed';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.width = '100vw';
  overlay.style.height = '100vh';
  overlay.style.backgroundColor = 'rgba(15, 23, 42, 0.4)'; // Slightly darker overlay to draw focus
  overlay.style.backdropFilter = 'blur(2px)';
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.zIndex = '10000';
  overlay.style.animation = 'fadeIn 0.2s ease-out';

  const modal = document.createElement('div');
  modal.style.backgroundColor = '#ffffff';
  modal.style.borderRadius = '8px';
  modal.style.boxShadow = '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)';
  modal.style.width = '100%';
  modal.style.maxWidth = '400px';
  modal.style.overflow = 'hidden';
  modal.style.fontFamily = 'sans-serif';
  modal.style.transform = 'translateY(-20px)';
  modal.style.animation = 'slideDown 0.3s ease-out forwards';

  const topBar = document.createElement('div');
  topBar.style.height = '4px';
  topBar.style.backgroundColor = '#fff'; // Red top bar to indicate destructive action
  modal.appendChild(topBar);

  const content = document.createElement('div');
  content.style.padding = '24px';
  
  const header = document.createElement('h3');
  header.innerText = `⚠️ ${title}`;
  header.style.margin = '0 0 12px 0';
  header.style.color = '#0f172a';
  header.style.fontSize = '18px';
  header.style.fontWeight = '600';
  
  const body = document.createElement('p');
  body.innerText = message;
  body.style.margin = '0 0 24px 0';
  body.style.color = '#475569';
  body.style.fontSize = '14px';
  body.style.lineHeight = '1.5';
  body.style.whiteSpace = 'pre-line'; 

  const buttonContainer = document.createElement('div');
  buttonContainer.style.display = 'flex';
  buttonContainer.style.justifyContent = 'flex-end';
  buttonContainer.style.gap = '12px'; // Add space between buttons

  // Cancel Button
  const cancelBtn = document.createElement('button');
  cancelBtn.innerText = 'Cancel';
  cancelBtn.style.backgroundColor = '#f1f5f9';
  cancelBtn.style.color = '#0f172a';
  cancelBtn.style.border = 'none';
  cancelBtn.style.padding = '8px 16px';
  cancelBtn.style.borderRadius = '6px';
  cancelBtn.style.fontSize = '14px';
  cancelBtn.style.fontWeight = '500';
  cancelBtn.style.cursor = 'pointer';
  cancelBtn.style.transition = 'background-color 0.2s';
  cancelBtn.onmouseenter = () => cancelBtn.style.backgroundColor = '#e2e8f0';
  cancelBtn.onmouseleave = () => cancelBtn.style.backgroundColor = '#f1f5f9';

  // Confirm Button (Destructive Red)
  const confirmBtn = document.createElement('button');
  confirmBtn.innerText = 'Delete';
  confirmBtn.style.backgroundColor = '#f1f5f9';
  confirmBtn.style.color = '#0f172a';
  confirmBtn.style.border = 'none';
  confirmBtn.style.padding = '8px 16px';
  confirmBtn.style.borderRadius = '6px';
  confirmBtn.style.fontSize = '14px';
  confirmBtn.style.fontWeight = '500';
  confirmBtn.style.cursor = 'pointer';
  confirmBtn.style.transition = 'background-color 0.2s';
  confirmBtn.onmouseenter = () => confirmBtn.style.backgroundColor = '#e2e8f0';
  confirmBtn.onmouseleave = () => confirmBtn.style.backgroundColor = '#f1f5f9';

  const closeModal = () => {
    overlay.style.opacity = '0';
    setTimeout(() => overlay.remove(), 200); 
  };

  cancelBtn.onclick = closeModal;
  
  confirmBtn.onclick = () => {
      onConfirm();
      closeModal();
  };

  overlay.onclick = (e) => {
    if (e.target === overlay) closeModal(); 
  };

  buttonContainer.appendChild(cancelBtn);
  buttonContainer.appendChild(confirmBtn);
  
  content.appendChild(header);
  content.appendChild(body);
  content.appendChild(buttonContainer);
  modal.appendChild(content);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
} 