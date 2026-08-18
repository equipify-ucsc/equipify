document.addEventListener('DOMContentLoaded', () => {
  // Password Visibility Toggle
  const setupPasswordToggle = (inputId, toggleId) => {
    const input = document.getElementById(inputId);
    const toggle = document.getElementById(toggleId);

    if (input && toggle) {
      toggle.addEventListener('click', () => {
        const isPassword = input.getAttribute('type') === 'password';
        input.setAttribute('type', isPassword ? 'text' : 'password');
        toggle.classList.toggle('fa-eye');
        toggle.classList.toggle('fa-eye-slash');
      });
    }
  };

  setupPasswordToggle('password', 'togglePassword');
  setupPasswordToggle('confirmPassword', 'toggleConfirmPassword');

  // File Upload Handling
  const setupFileUpload = (dropZoneId, fileInputId, textId) => {
    const dropZone = document.getElementById(dropZoneId);
    const fileInput = document.getElementById(fileInputId);
    const textLabel = document.getElementById(textId);

    if (dropZone && fileInput && textLabel) {
      dropZone.addEventListener('click', () => fileInput.click());

      fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
          textLabel.textContent = e.target.files[0].name;
          dropZone.style.borderColor = '#0f766e';
          dropZone.style.backgroundColor = 'rgba(15, 118, 110, 0.05)';
        }
      });
    }
  };

  setupFileUpload('logoDropZone', 'businessLogo', 'logoText');
  setupFileUpload('brDropZone', 'brCertificate', 'brText');

  // Form Submission Validation
  const registerForm = document.getElementById('registerForm');
  if (registerForm) {
    registerForm.addEventListener('submit', (e) => {
      e.preventDefault();

      const pass = document.getElementById('password').value;
      const confirmPass = document.getElementById('confirmPassword').value;

      if (pass !== confirmPass) {
        alert('Passwords do not match. Please re-enter.');
        return;
      }

      alert('Registration successful! Redirecting to dashboard...');
    });
  }
});