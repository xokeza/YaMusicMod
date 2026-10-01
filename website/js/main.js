document.addEventListener('DOMContentLoaded', () => {
    // OS Detection
    const userAgent = window.navigator.userAgent.toLowerCase();
    const downloadBtn = document.getElementById('primaryDownloadBtn');
    const osLabel = document.getElementById('currentOsLabel');

    let detectedOS = 'Windows';
    let downloadUrl = 'https://github.com/xokeza/YaMusicMod/releases/latest';

    if (userAgent.includes('win')) {
        detectedOS = 'Windows';
        downloadUrl = 'https://github.com/xokeza/YaMusicMod/releases/latest';
    } else if (userAgent.includes('mac') || userAgent.includes('darwin')) {
        detectedOS = 'macOS';
        downloadUrl = 'https://github.com/xokeza/YaMusicMod/releases/latest';
    } else if (userAgent.includes('linux')) {
        detectedOS = 'Linux';
        downloadUrl = 'https://github.com/xokeza/YaMusicMod/releases/latest';
    }

    if (downloadBtn) {
        const btnText = downloadBtn.querySelector('.btn-text');
        if (btnText) {
            btnText.textContent = `Скачать для ${detectedOS}`;
        }
        downloadBtn.href = downloadUrl;
    }

    if (osLabel) {
        osLabel.textContent = `Доступно для ${detectedOS}, а также других ОС`;
    }

    // Modal Handler
    const modalOverlay = document.getElementById('installModal');
    const openModalBtns = document.querySelectorAll('.open-install-modal');
    const closeModalBtn = document.getElementById('closeModalBtn');

    function openModal() {
        if (modalOverlay) {
            modalOverlay.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    }

    function closeModal() {
        if (modalOverlay) {
            modalOverlay.classList.remove('active');
            document.body.style.overflow = '';
        }
    }

    openModalBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            openModal();
        });
    });

    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', closeModal);
    }

    if (modalOverlay) {
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) closeModal();
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modalOverlay?.classList.contains('active')) {
            closeModal();
        }
    });

    // Installation Tabs
    const tabs = document.querySelectorAll('.install-tab');
    const tabPanes = document.querySelectorAll('.tab-pane');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tabPanes.forEach(p => p.style.display = 'none');

            tab.classList.add('active');
            const targetId = tab.getAttribute('data-tab');
            const targetPane = document.getElementById(targetId);
            if (targetPane) {
                targetPane.style.display = 'block';
            }
        });
    });

    // Copy to clipboard
    const copyBtns = document.querySelectorAll('.copy-btn');
    copyBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const codeBox = btn.closest('.code-box');
            const code = codeBox.querySelector('code');
            if (code) {
                navigator.clipboard.writeText(code.innerText.trim()).then(() => {
                    const originalText = btn.textContent;
                    btn.textContent = 'Скопировано!';
                    setTimeout(() => {
                        btn.textContent = originalText;
                    }, 2000);
                });
            }
        });
    });

    // Fetch GitHub Repo Stats
    const repoStars = document.getElementById('githubStarsCount');
    const repoForks = document.getElementById('githubForksCount');

    if (repoStars || repoForks) {
        fetch('https://api.github.com/repos/xokeza/YaMusicMod')
            .then(res => res.json())
            .then(data => {
                if (repoStars && typeof data.stargazers_count === 'number') {
                    repoStars.textContent = data.stargazers_count;
                }
                if (repoForks && typeof data.forks_count === 'number') {
                    repoForks.textContent = data.forks_count;
                }
            })
            .catch(() => {
                // Fallback default
            });
    }
});
