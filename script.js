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

        // Spawn a burst of emojis
        for (let i = 0; i < 5; i++) {
            spawnEmoji(btnRect.left + btnWidth / 2, btnRect.top + btnHeight / 2);
        }
    };

    const spawnEmoji = (x, y) => {
        const emoji = document.createElement('div');
        emoji.textContent = emojis[Math.floor(Math.random() * emojis.length)];
        emoji.style.position = 'fixed';
        emoji.style.left = `${x}px`;
        emoji.style.top = `${y}px`;
        emoji.style.fontSize = `${Math.random() * 1.5 + 1.5}rem`; // Random size 1.5-3rem
        emoji.style.pointerEvents = 'none';
        emoji.style.zIndex = '9999';
        emoji.style.transition = 'all 0.8s cubic-bezier(0.25, 1, 0.5, 1)'; // Pop effect
        emoji.style.transform = 'translate(-50%, -50%) scale(0)'; // Start hidden

        document.body.appendChild(emoji);

        // Randomize physics
        const randomX = (Math.random() - 0.5) * 100; // -50 to 50px
        const randomY = -50 - Math.random() * 100;   // -50 to -150px (upwards)
        const randomRotate = (Math.random() - 0.5) * 90;

        // Animate
        requestAnimationFrame(() => {
            emoji.style.transform = `translate(${randomX}px, ${randomY}px) rotate(${randomRotate}deg) scale(1)`;
            emoji.style.opacity = '0';
        });

        // Cleanup
        setTimeout(() => {
            emoji.remove();
        }, 800);
    };

    // Add event listeners
    btn.addEventListener('mouseover', moveButton);
    btn.addEventListener('click', moveButton); // Just in case on touch devices
    btn.addEventListener('touchstart', moveButton);

    // Auto-taunt: Spawn a laughing emoji every 2 seconds randomly near the button
    setInterval(() => {
        const rect = btn.getBoundingClientRect();
        // Random position around the button
        const offsetX = (Math.random() - 0.5) * 100;
        const offsetY = (Math.random() - 0.5) * 100;
        spawnEmoji(rect.left + rect.width / 2 + offsetX, rect.top + rect.height / 2 + offsetY);
    }, 2000);
});
