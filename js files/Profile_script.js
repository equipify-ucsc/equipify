document.addEventListener('DOMContentLoaded', () => {
  const saveBtn = document.querySelector('.btn-primary');
  const editBtn = document.querySelector('.btn-outline');
  const inputs = document.querySelectorAll('input, textarea, select');

  // Toggle Edit Mode
  let isEditing = false;

  if (editBtn) {
    editBtn.addEventListener('click', () => {
      isEditing = !isEditing;
      if (isEditing) {
        editBtn.textContent = 'Cancel';
        editBtn.style.backgroundColor = '#f1f5f9';
        
        inputs.forEach(input => {
          if (!input.hasAttribute('readonly')) {
            input.style.borderColor = 'var(--accent-teal)';
            input.style.backgroundColor = '#ffffff';
          }
        });
      } else {
        editBtn.textContent = 'Edit Profile';
        editBtn.style.backgroundColor = '#ffffff';
        
        inputs.forEach(input => {
          input.style.borderColor = 'var(--border-color)';
          input.style.backgroundColor = 'var(--bg-offwhite)';
        });
      }
    });
  }

  // Save Profile Handler
  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      saveBtn.textContent = 'Saving...';
      saveBtn.style.opacity = '0.7';

      setTimeout(() => {
        saveBtn.textContent = 'Save Changes';
        saveBtn.style.opacity = '1';
        
        if (isEditing && editBtn) {
          editBtn.click(); // Exit edit mode
        }

        // Quick Feedback Toast / Alert
        const originalText = saveBtn.textContent;
        saveBtn.textContent = 'Saved!';
        saveBtn.style.backgroundColor = '#059669';

        setTimeout(() => {
          saveBtn.textContent = originalText;
          saveBtn.style.backgroundColor = 'var(--accent-teal)';
        }, 1500);
      }, 600);
    });
  }
});