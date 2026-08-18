document.addEventListener('DOMContentLoaded', () => {
  // Render Curved Revenue Chart using Chart.js
  const ctx = document.getElementById('revenueChart').getContext('2d');

  // Gradient fill under the curve
  const gradient = ctx.createLinearGradient(0, 0, 0, 200);
  gradient.addColorStop(0, 'rgba(13, 148, 136, 0.25)');
  gradient.addColorStop(1, 'rgba(13, 148, 136, 0.0)');

  new Chart(ctx, {
    type: 'line',
    data: {
      labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
      datasets: [{
        label: 'Revenue ($)',
        data: [4200, 3800, 2900, 8500, 4800, 12450],
        borderColor: '#1d4ed8',
        borderWidth: 2.5,
        tension: 0.45, // Smooth curve
        fill: true,
        backgroundColor: gradient,
        pointRadius: 0,
        pointHoverRadius: 6,
        pointHoverBackgroundColor: '#1d4ed8'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1e293b',
          padding: 10,
          displayColors: false
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#94a3b8', font: { size: 11 } }
        },
        y: {
          display: false,
          grid: { display: false }
        }
      }
    }
  });
});