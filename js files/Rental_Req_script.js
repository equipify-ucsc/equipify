document.addEventListener('DOMContentLoaded', () => {
  // Interactive elements
  const statusFilter = document.getElementById('statusFilter');
  const tableRows = document.querySelectorAll('.rentals-table tbody tr');
  const tabItems = document.querySelectorAll('.tab-item');
  const paginationBtns = document.querySelectorAll('.pagination-btn');

  // Filter Table by Status
  if (statusFilter) {
    statusFilter.addEventListener('change', (e) => {
      const selectedStatus = e.target.value.toLowerCase();

      tableRows.forEach(row => {
        const badge = row.querySelector('.status-badge');
        if (!badge) return;

        const statusText = badge.textContent.trim().toLowerCase();

        if (selectedStatus === 'all' || statusText === selectedStatus) {
          row.style.display = '';
        } else {
          row.style.display = 'none';
        }
      });
    });
  }

  // Header Tab Menu Switching
  tabItems.forEach(tab => {
    tab.addEventListener('click', (e) => {
      e.preventDefault();
      tabItems.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
    });
  });

  // Simple Pagination Switching Effect
  paginationBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.classList.contains('disabled')) return;

      paginationBtns.forEach(b => b.classList.remove('active'));
      if (!isNaN(btn.textContent.trim())) {
        btn.classList.add('active');
      }
    });
  });
});