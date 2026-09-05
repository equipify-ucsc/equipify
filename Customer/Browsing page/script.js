// Equipify — vanilla JS interactivity

document.addEventListener('DOMContentLoaded', () => {
  initWishlistToggles();
  initPagination();
  initMobilePanels();
  initRatingFilter();
});

/**
 * Toggle the "wishlisted" state of each equipment card's heart button.
 * Swaps the aria-label and the visual (filled vs outline) state.
 */
function initWishlistToggles() {
  const wishlistButtons = document.querySelectorAll('[data-wishlist-toggle]');

  wishlistButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const isActive = button.classList.toggle('is-active');
      const icon = button.querySelector('.icon');

      if (icon) {
        icon.classList.toggle('icon--fill', isActive);
      }

      button.setAttribute(
        'aria-label',
        isActive ? 'Remove from wishlist' : 'Add to wishlist'
      );
    });
  });
}

/**
 * Handle pagination button clicks: mark the clicked page as active
 * and update the previous/next button disabled state.
 */
function initPagination() {
  const pagination = document.querySelector('.pagination');
  if (!pagination) return;

  const pageButtons = pagination.querySelectorAll('.pagination__page');
  const prevButton = pagination.querySelector('[aria-label="Previous page"]');
  const nextButton = pagination.querySelector('[aria-label="Next page"]');

  pageButtons.forEach((button) => {
    button.addEventListener('click', () => {
      pageButtons.forEach((btn) => {
        btn.classList.remove('is-active');
        btn.removeAttribute('aria-current');
      });
      button.classList.add('is-active');
      button.setAttribute('aria-current', 'page');

      // First page: disable "previous". Otherwise enable it.
      const isFirstPage = button === pageButtons[0];
      if (prevButton) prevButton.disabled = isFirstPage;
    });
  });

  if (prevButton) {
    prevButton.addEventListener('click', () => {
      const active = pagination.querySelector('.pagination__page.is-active');
      const index = Array.from(pageButtons).indexOf(active);
      if (index > 0) {
        pageButtons[index - 1].click();
      }
    });
  }

  if (nextButton) {
    nextButton.addEventListener('click', () => {
      const active = pagination.querySelector('.pagination__page.is-active');
      const index = Array.from(pageButtons).indexOf(active);
      if (index >= 0 && index < pageButtons.length - 1) {
        pageButtons[index + 1].click();
      }
    });
  }
}

/**
 * On small screens, the search bar and the filters sidebar are hidden by
 * default. This wires up the two buttons in the top nav that reveal them,
 * plus the ways to dismiss them again (close button, backdrop, Escape).
 */
function initMobilePanels() {
  const searchToggle = document.getElementById('mobile-search-toggle');
  const searchPanel = document.getElementById('mobile-search-panel');
  const filterToggle = document.getElementById('mobile-filter-toggle');
  const sidebar = document.getElementById('filters-sidebar');
  const sidebarClose = document.getElementById('sidebar-close');
  const backdrop = document.getElementById('sidebar-backdrop');

  // Mobile search panel: toggle open/closed
  if (searchToggle && searchPanel) {
    searchToggle.addEventListener('click', () => {
      const isOpen = !searchPanel.hidden;
      searchPanel.hidden = isOpen;
      searchToggle.setAttribute('aria-expanded', String(!isOpen));
      if (!isOpen) {
        const input = searchPanel.querySelector('input');
        if (input) input.focus();
      }
    });
  }

  // Filters sidebar: open as an overlay with a backdrop
  function openSidebar() {
    if (!sidebar) return;
    sidebar.classList.add('is-open');
    if (backdrop) backdrop.hidden = false;
    if (filterToggle) filterToggle.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
  }

  function closeSidebar() {
    if (!sidebar) return;
    sidebar.classList.remove('is-open');
    if (backdrop) backdrop.hidden = true;
    if (filterToggle) filterToggle.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  }

  if (filterToggle && sidebar) {
    filterToggle.addEventListener('click', openSidebar);
  }
  if (sidebarClose) {
    sidebarClose.addEventListener('click', closeSidebar);
  }
  if (backdrop) {
    backdrop.addEventListener('click', closeSidebar);
  }
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeSidebar();
  });
}

/**
 * Filter the equipment grid by the selected "Provider Rating" radio option.
 * Selecting a star rating shows only equipment rated at least that many
 * stars ("4 & up" shows 4.0-5.0, etc). Clicking the active option again,
 * or the "Clear rating filter" link, resets the list.
 */
function initRatingFilter() {
  const ratingInputs = document.querySelectorAll('#rating-filter-list input[name="rating"]');
  const clearButton = document.getElementById('rating-clear');
  const cards = document.querySelectorAll('#equipment-grid .card');
  const emptyState = document.getElementById('empty-state');

  if (!ratingInputs.length) return;

  function applyFilter(minRating) {
    let visibleCount = 0;

    cards.forEach((card) => {
      const rating = parseFloat(card.getAttribute('data-rating')) || 0;
      const matches = !minRating || rating >= minRating;
      card.hidden = !matches;
      if (matches) visibleCount += 1;
    });

    if (emptyState) {
      emptyState.hidden = visibleCount !== 0;
    }

    if (clearButton) {
      clearButton.hidden = !minRating;
    }
  }

  function updateSelectedStyles() {
    ratingInputs.forEach((input) => {
      const label = input.closest('.filter-option');
      if (label) label.classList.toggle('is-selected', input.checked);
    });
  }

  ratingInputs.forEach((input) => {
    input.addEventListener('click', () => {
      // Clicking the currently-selected option again clears the filter.
      if (input.dataset.wasChecked === 'true') {
        input.checked = false;
        input.dataset.wasChecked = 'false';
        updateSelectedStyles();
        applyFilter(0);
        return;
      }
      ratingInputs.forEach((other) => {
        other.dataset.wasChecked = String(other === input);
      });
      updateSelectedStyles();
      applyFilter(parseInt(input.value, 10));
    });
  });

  if (clearButton) {
    clearButton.addEventListener('click', () => {
      ratingInputs.forEach((input) => {
        input.checked = false;
        input.dataset.wasChecked = 'false';
      });
      updateSelectedStyles();
      applyFilter(0);
    });
  }
}
