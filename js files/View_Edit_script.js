// Switch Gallery Main Image
function switchGalleryImg(element, imageUrl) {
  const mainImg = document.getElementById('mainGalleryImg');
  if (mainImg) {
    mainImg.src = imageUrl;
  }

  // Update active thumbnail borders
  const thumbnails = document.querySelectorAll('.thumb-item');
  thumbnails.forEach(thumb => thumb.classList.remove('active'));
  element.classList.add('active');
}

// Interactive Save / Cancel Buttons
document.addEventListener('DOMContentLoaded', () => {
  const saveBtn = document.getElementById('saveBtn');
  const cancelBtn = document.getElementById('cancelBtn');

  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      const originalText = saveBtn.innerHTML;
      saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
      saveBtn.style.opacity = '0.7';

      setTimeout(() => {
        saveBtn.innerHTML = '<i class="fa-solid fa-check"></i> Saved!';
        saveBtn.style.opacity = '1';

        setTimeout(() => {
          saveBtn.innerHTML = originalText;
        }, 1500);
      }, 800);
    });
  }

  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      if (confirm('Are you sure you want to discard changes?')) {
        location.reload();
      }
    });
  }
});