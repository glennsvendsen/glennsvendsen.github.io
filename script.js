document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('catchMeBtn');

    if (!btn) return;

    const emojis = ['😂', '🥶', '❄️', '🧊', '🏃', '💨'];

    // Function to move the button
    const moveButton = (e) => {
        // Prevent default click behavior if they somehow manage to click it
        e && e.preventDefault();

        // Get viewport dimensions
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        // Button dimensions
        const btnRect = btn.getBoundingClientRect();
        const btnWidth = btnRect.width;
        const btnHeight = btnRect.height;

        // Calculate safe area (keep it within viewport with some padding)
        const padding = 20;
        const maxLeft = viewportWidth - btnWidth - padding;
        const maxTop = viewportHeight - btnHeight - padding;
        const minLeft = padding;
        const minTop = padding;

        // Generate random position
        const newLeft = Math.floor(Math.random() * (maxLeft - minLeft + 1)) + minLeft;
        const newTop = Math.floor(Math.random() * (maxTop - minTop + 1)) + minTop;

        // Switch to fixed positioning if not already
        btn.style.position = 'fixed';
        btn.style.left = `${newLeft}px`;
        btn.style.top = `${newTop}px`;
        // Ensure z-index is high enough
        btn.style.zIndex = '100';

        // Spawn laughing emoji
        spawnEmoji(btnRect.left + btnWidth / 2, btnRect.top);
    };

    const spawnEmoji = (x, y) => {
        const emoji = document.createElement('div');
        emoji.textContent = emojis[Math.floor(Math.random() * emojis.length)];
        emoji.style.position = 'fixed';
        emoji.style.left = `${x}px`;
        emoji.style.top = `${y}px`;
        emoji.style.fontSize = '2rem';
        emoji.style.pointerEvents = 'none';
        emoji.style.zIndex = '101';
        emoji.style.transition = 'all 1s ease-out';

        document.body.appendChild(emoji);

        // Animate
        requestAnimationFrame(() => {
            emoji.style.transform = `translate(-50%, -100px) scale(1.5)`;
            emoji.style.opacity = '0';
        });

        // Cleanup
        setTimeout(() => {
            emoji.remove();
        }, 1000);
    };

    // Add event listeners
    btn.addEventListener('mouseover', moveButton);
    btn.addEventListener('click', moveButton); // Just in case on touch devices
    btn.addEventListener('touchstart', moveButton);
});
