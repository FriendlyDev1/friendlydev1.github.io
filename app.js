// app.js

// Configuration - IMPORTANT: This MUST match your live backend URL
const API_BASE_URL = "https://lustroom-downloader-backend.onrender.com/api/v1";

// --- Logic for login.html ---
if (document.getElementById('loginForm')) {
    const loginForm = document.getElementById('loginForm');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const errorMessageDiv = document.getElementById('errorMessage');
    const loadingMessageDiv = document.getElementById('loadingMessage');

    loginForm.addEventListener('submit', async function(event) {
        event.preventDefault();
        const email = emailInput.value.trim();
        const password = passwordInput.value.trim();

        if (!email || !password) {
            displayError("Please enter both email and password.");
            return;
        }

        showLoading(true);
        displayError("");

        try {
            const response = await fetch(`${API_BASE_URL}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email, password: password }),
            });

            const data = await response.json();
            showLoading(false);

            if (response.ok && data.status === 'success' && data.access_token) {
                // Store JWT and expiry info
                localStorage.setItem('lustroom_jwt', data.access_token);
                localStorage.setItem('lustroom_jwt_expires_in', data.expires_in);
                localStorage.setItem('lustroom_jwt_obtained_at', Math.floor(Date.now() / 1000));
                
                if (data.user_info && data.user_info.platform_id) {
                    localStorage.setItem('user_platform_id', data.user_info.platform_id);
                }

                window.location.href = 'links.html';
            } else {
                displayError(data.message || "Login failed. Please check your credentials.");
            }
        } catch (error) {
            showLoading(false);
            console.error("Login request error:", error);
            displayError("An error occurred while trying to log in. Please check your internet connection or try again later.");
        }
    });

    function displayError(message) {
        if (errorMessageDiv) {
            errorMessageDiv.textContent = message;
            errorMessageDiv.style.display = message ? 'block' : 'none';
        }
    }

    function showLoading(isLoading) {
        if (loadingMessageDiv) {
            loadingMessageDiv.style.display = isLoading ? 'block' : 'none';
        }
        if (loginForm) {
            const submitButton = loginForm.querySelector('button[type="submit"]');
            if (submitButton) {
                submitButton.disabled = isLoading;
            }
        }
    }
}


// --- Logic for links.html (The main application view) ---
if (document.getElementById('appContainer')) {
    const mainContent = document.getElementById('mainContent');
    const logoutButton = document.getElementById('logoutButton');
    
    // --- State and Data Store ---
    let allPlatformsData = [];
    let allTiersData = [];
    const userPlatformId = localStorage.getItem('user_platform_id');

    // --- Utility Functions ---
    function isTokenValid() {
        const token = localStorage.getItem('lustroom_jwt');
        const obtainedAt = parseInt(localStorage.getItem('lustroom_jwt_obtained_at'), 10);
        const expiresIn = parseInt(localStorage.getItem('lustroom_jwt_expires_in'), 10);

        if (!token || isNaN(obtainedAt) || isNaN(expiresIn)) return false;
        
        const nowInSeconds = Math.floor(Date.now() / 1000);
        return (obtainedAt + expiresIn - 60) > nowInSeconds;
    }

    function displayError(message, container = mainContent) {
        container.innerHTML = `<div class="error-message">${message}</div>`;
    }

    // --- Skeleton Loaders ---
    function renderPlatformSkeleton() {
        let skeletonHTML = '<h2>Platforms</h2><div class="platforms-grid">';
        for (let i = 0; i < 3; i++) {
            skeletonHTML += `<div class="platform-card-skeleton"><div class="skeleton skeleton-platform-thumbnail"></div><div class="skeleton skeleton-platform-title"></div></div>`;
        }
        skeletonHTML += '</div>';
        mainContent.innerHTML = skeletonHTML;
    }

    function renderTierSkeleton(platformName) {
         let skeletonHTML = `
            <div class="view-header">
                <button class="back-button" onclick="window.history.back()">← Back to Platforms</button>
                <h2>${platformName || 'Tiers'}</h2>
            </div>
            <div class="tiers-grid">`;
        for (let i = 0; i < 3; i++) {
            skeletonHTML += `<div class="tier-card-skeleton"><div class="skeleton skeleton-tier-thumbnail"></div><div class="skeleton skeleton-tier-title"></div></div>`;
        }
        skeletonHTML += '</div>';
        mainContent.innerHTML = skeletonHTML;
    }

    function renderContentSkeleton(platformName) {
        let skeletonHTML = `
            <div class="view-header">
                 <button class="back-button" onclick="window.history.back()">← Back to Tiers</button>
                 <h2>${platformName || 'Content'}</h2>
            </div>`;
        for (let i = 0; i < 2; i++) {
            skeletonHTML += `<div class="tier-group"><div class="skeleton skeleton-title"></div><div class="skeleton-card"><div class="skeleton skeleton-thumbnail"></div><div class="skeleton-card-content"><div class="skeleton skeleton-text"></div><div class="skeleton skeleton-text short"></div></div></div></div>`;
        }
        mainContent.innerHTML = skeletonHTML;
    }

    // --- Modal Logic ---
    const platformModal = document.getElementById('platformModal');
    const tierModal = document.getElementById('tierModal');

    function showPlatformModal(platform) {
        // ... (this function is unchanged)
    }

    function showTierModal(tier, platformId) {
        document.getElementById('tierModalImage').src = tier.thumbnail_url || '';
        document.getElementById('tierModalTitle').textContent = tier.name;
        document.getElementById('tierModalDescription').textContent = tier.description;
        
        const viewContentBtn = document.getElementById('tierModalViewContentBtn');
        
        // Remove old listeners and add a new one to avoid stacking
        const newBtn = viewContentBtn.cloneNode(true);
        viewContentBtn.parentNode.replaceChild(newBtn, viewContentBtn);

        newBtn.onclick = () => {
            hideModal(tierModal);
            // Navigate to the content view
            const platformName = allPlatformsData.find(p => p.id.toString() === platformId)?.name;
            fetchAndDisplayContent(platformId, platformName);
        };
        
        tierModal.style.display = 'block';
    }

    function hideModal(modalElement) {
        if (modalElement) {
            modalElement.style.display = 'none';
            if (modalElement.id === 'platformModal') {
                document.getElementById('modalTeaserVideo').pause();
            }
        }
    }
    
    document.querySelectorAll('.modal-close-btn').forEach(btn => {
        btn.onclick = () => hideModal(btn.closest('.modal'));
    });
    window.onclick = function(event) {
        if (event.target.classList.contains('modal')) {
            hideModal(event.target);
        }
    };

    // --- Platform View Logic ---
    async function fetchAndDisplayPlatforms() {
        renderPlatformSkeleton();
        try {
            const response = await fetch(`${API_BASE_URL}/platforms`);
            const data = await response.json();
            if (response.ok && data.status === 'success' && data.platforms) {
                allPlatformsData = data.platforms;
                renderPlatforms(data.platforms);
            } else {
                displayError(data.message || "Failed to fetch platforms.");
            }
        } catch (error) {
            console.error("Fetch platforms error:", error);
            displayError("An error occurred while fetching platforms.");
        }
    }

    function renderPlatforms(platforms) {
        let platformsHTML = '<h2>Platforms</h2><div class="platforms-grid">';
        platforms.forEach(platform => {
            const isLocked = platform.id.toString() !== userPlatformId;
            platformsHTML += `<div class="platform-card ${isLocked ? 'locked' : ''}" data-platform-id="${platform.id}"><div class="platform-thumbnail" style="background-image: url('${platform.thumbnail_url || ''}')"></div><div class="platform-name">${platform.name}</div>${isLocked ? '<div class="lock-icon">🔒</div>' : ''}</div>`;
        });
        platformsHTML += '</div>';
        mainContent.innerHTML = platformsHTML;
        mainContent.querySelector('.platforms-grid').addEventListener('click', handlePlatformClick);
    }
    
    function handlePlatformClick(event) {
        const card = event.target.closest('.platform-card');
        if (!card) return;
        const platformId = card.dataset.platformId;
        const platformData = allPlatformsData.find(p => p.id.toString() === platformId);

        if (card.classList.contains('locked')) {
            showPlatformModal(platformData);
        } else {
            // Use pushState for SPA-like navigation without full reload
            history.pushState({view: 'tiers', platformId}, '', `?view=tiers&platform_id=${platformId}`);
            fetchAndDisplayTiers(platformId, platformData.name);
        }
    }

    // --- Tiers View Logic ---
    async function fetchAndDisplayTiers(platformId, platformName) {
        renderTierSkeleton(platformName);
        try {
            const token = localStorage.getItem('lustroom_jwt');
            const response = await fetch(`${API_BASE_URL}/platforms/${platformId}/tiers`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();

            if (response.ok && data.status === 'success' && data.tiers) {
                allTiersData = data.tiers;
                renderTiers(data.tiers, platformId, platformName);
            } else {
                displayError(data.message || "Failed to fetch tiers.");
            }
        } catch (error) {
            console.error("Fetch tiers error:", error);
            displayError("An error occurred while fetching tiers.");
        }
    }

    function renderTiers(tiers, platformId, platformName) {
        let tiersHTML = `
            <div class="view-header">
                <button class="back-button" onclick="window.history.back()">← Back to Platforms</button>
                <h2>${platformName} Tiers</h2>
            </div>
            <div class="tiers-grid">`;
        tiers.forEach(tier => {
            tiersHTML += `
                <div class="tier-card" data-tier-id="${tier.id}">
                    <div class="tier-thumbnail" style="background-image: url('${tier.thumbnail_url || ''}')"></div>
                    <div class="tier-name">${tier.name}</div>
                </div>`;
        });
        tiersHTML += '</div>';
        mainContent.innerHTML = tiersHTML;
        mainContent.querySelector('.tiers-grid').addEventListener('click', (e) => handleTierClick(e, platformId));
    }

    function handleTierClick(event, platformId) {
        const card = event.target.closest('.tier-card');
        if (!card) return;
        const tierId = card.dataset.tierId;
        const tierData = allTiersData.find(t => t.id.toString() === tierId);
        showTierModal(tierData, platformId);
    }

    // --- Content View Logic ---
    async function fetchAndDisplayContent(platformId, platformName) {
        renderContentSkeleton(platformName);
        try {
            const token = localStorage.getItem('lustroom_jwt');
            const response = await fetch(`${API_BASE_URL}/get_patron_links`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            if (response.ok && data.status === 'success' && data.content) {
                mainContent.innerHTML = `
                    <div class="view-header">
                        <button class="back-button" onclick="window.history.back()">← Back to Tiers</button>
                        <h2>${platformName} Content</h2>
                    </div>
                    <div id="filterContainer" class="filter-container"></div>
                    <div id="linksContentContainer"></div>`;
                renderContent(data.content);
                setupFilters(data.content);
            } else if (response.status === 401 || response.status === 403) {
                localStorage.clear(); window.location.href = 'login.html';
            } else {
                displayError(data.message || "Failed to fetch content.");
            }
        } catch (error) {
            console.error("Fetch content error:", error);
            displayError("An error occurred while fetching content.");
        }
    }

    function renderContent(contentData) {
        // This function is the same as the one from the previous completed step.
        // It renders the tier groups and link cards into the #linksContentContainer.
        const linksContentContainer = document.getElementById('linksContentContainer');
        if (!linksContentContainer) return;
        linksContentContainer.innerHTML = ''; 

        for (const tierName in contentData) {
            const links = contentData[tierName];
            if (links.length === 0) continue;

            const tierGroup = document.createElement('div');
            tierGroup.className = 'tier-group';
            const tierTitle = document.createElement('h2');
            tierTitle.className = 'tier-title';
            tierTitle.textContent = tierName;
            tierGroup.appendChild(tierTitle);

            links.forEach(link => {
                const card = document.createElement('div');
                card.className = 'link-card';
                if (link.locked) card.classList.add('locked');
                card.dataset.contentType = link.content_type || 'Video';

                if (link.thumbnail_url) {
                    const thumbnailContainer = document.createElement('div');
                    thumbnailContainer.className = 'thumbnail-container';
                    const thumbnailImage = document.createElement('img');
                    thumbnailImage.src = link.thumbnail_url;
                    thumbnailImage.alt = `Thumbnail for ${link.title}`;
                    thumbnailImage.loading = 'lazy';
                    thumbnailContainer.appendChild(thumbnailImage);
                    card.appendChild(thumbnailContainer);
                }

                const cardContent = document.createElement('div');
                cardContent.className = 'card-content';
                const title = document.createElement('h3');
                const titleLink = document.createElement('a');
                titleLink.href = link.url ? link.url : '#'; 
                if (!link.url) titleLink.style.cursor = 'default';
                titleLink.textContent = link.title || "Untitled Link";
                titleLink.target = "_blank";
                title.appendChild(titleLink);
                cardContent.appendChild(title);

                if (link.description) {
                    const description = document.createElement('p');
                    description.textContent = link.description;
                    cardContent.appendChild(description);
                }
                
                const metaInfo = document.createElement('div');
                metaInfo.className = 'meta-info';
                if (link.category) { 
                     const categorySpan = document.createElement('span');
                    categorySpan.innerHTML = `<strong>Category:</strong> ${link.category}`;
                    metaInfo.appendChild(categorySpan);
                }
                cardContent.appendChild(metaInfo);

                if (!link.locked) {
                    const actionsContainer = document.createElement('div');
                    actionsContainer.className = 'card-actions';
                    const copyButton = document.createElement('button');
                    copyButton.className = 'copy-btn';
                    copyButton.textContent = 'Copy Link';
                    copyButton.addEventListener('click', () => { 
                         navigator.clipboard.writeText(link.url).then(() => {
                            copyButton.textContent = 'Copied! ✓';
                            copyButton.classList.add('copied');
                            setTimeout(() => { copyButton.textContent = 'Copy Link'; copyButton.classList.remove('copied'); }, 2000);
                        });
                    });
                    actionsContainer.appendChild(copyButton);
                    cardContent.appendChild(actionsContainer);
                }
                
                card.appendChild(cardContent);
                tierGroup.appendChild(card);
            });
            linksContentContainer.appendChild(tierGroup);
        }
    }
    
    function setupFilters(contentData) {
        const filterContainer = document.getElementById('filterContainer');
        if (!filterContainer) return;
        const contentTypes = new Set();
        Object.values(contentData).flat().forEach(link => contentTypes.add(link.content_type || 'Video'));
        filterContainer.innerHTML = ''; 

        const allButton = document.createElement('button');
        allButton.className = 'filter-btn active';
        allButton.textContent = 'All';
        allButton.dataset.filter = 'All';
        filterContainer.appendChild(allButton);

        contentTypes.forEach(type => {
            const button = document.createElement('button');
            button.className = 'filter-btn';
            button.textContent = type;
            button.dataset.filter = type;
            filterContainer.appendChild(button);
        });
        filterContainer.addEventListener('click', handleFilterClick);
    }
    
    function handleFilterClick(event) {
        if (!event.target.classList.contains('filter-btn')) return;
        const filterValue = event.target.dataset.filter;
        document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
        event.target.classList.add('active');
        applyFilter(filterValue);
    }

    function applyFilter(filter) {
        document.querySelectorAll('.link-card').forEach(card => {
            card.style.display = (filter === 'All' || card.dataset.contentType === filter) ? 'block' : 'none';
        });
        document.querySelectorAll('.tier-group').forEach(group => {
            group.style.display = group.querySelector('.link-card:not([style*="display: none"])') ? 'block' : 'none';
        });
    }

    // --- Main Application Router ---
    function router() {
        if (!isTokenValid()) {
            window.location.href = 'login.html';
            return;
        }

        const urlParams = new URLSearchParams(window.location.search);
        const view = urlParams.get('view');
        const platformId = urlParams.get('platform_id');
        const platformName = allPlatformsData.find(p => p.id.toString() === platformId)?.name;

        if (view === 'content' && platformId) {
            fetchAndDisplayContent(platformId, platformName);
        } else if (view === 'tiers' && platformId) {
            fetchAndDisplayTiers(platformId, platformName);
        } else {
            fetchAndDisplayPlatforms();
        }
    }
    
    // Initial load
    document.addEventListener('DOMContentLoaded', router);
    // Handle back/forward browser navigation
    window.onpopstate = router;
    
    // Global event handlers
    logoutButton.addEventListener('click', () => {
        localStorage.clear();
        window.location.href = 'login.html';
    });
}