document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('equipmentSearch');
  const categoryFilter = document.getElementById('categoryFilter');
  const statusFilter = document.getElementById('statusFilter');
  const equipmentGrid = document.getElementById('equipmentGrid');
  const cards = equipmentGrid.querySelectorAll('.equipment-card');
  const loadMoreBtn = document.getElementById('loadMoreBtn');

  // Filter functionality
  const filterEquipment = () => {
    const searchTerm = searchInput.value.toLowerCase();
    const categoryValue = categoryFilter.value.toLowerCase();
    const statusValue = statusFilter.value.toLowerCase();

    cards.forEach(card => {
      const title = card.querySelector('h3').textContent.toLowerCase();
      const category = card.querySelector('.card-category').textContent.toLowerCase();
      const statusBadge = card.querySelector('.status-badge').textContent.toLowerCase();

      const matchesSearch = title.includes(searchTerm);
      const matchesCategory = categoryValue === 'all' || category.includes(categoryValue);
      const matchesStatus = statusValue === 'all' || statusBadge.replace(' ', '-').includes(statusValue);

      if (matchesSearch && matchesCategory && matchesStatus) {
        card.style.display = 'flex';
      } else {
        card.style.display = 'none';
      }
    });
  };

  searchInput.addEventListener('input', filterEquipment);
  categoryFilter.addEventListener('change', filterEquipment);
  statusFilter.addEventListener('change', filterEquipment);

  // Load More Button Interaction
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', () => {
      loadMoreBtn.textContent = 'Loading...';
      setTimeout(() => {
        loadMoreBtn.textContent = 'No More Equipment to Load';
        loadMoreBtn.disabled = true;
        loadMoreBtn.style.opacity = '0.6';
        loadMoreBtn.style.cursor = 'default';
      }, 800);
    });
  }
});