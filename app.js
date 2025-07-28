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
                localStorage.setItem('lustroom_jwt', data.access_token);
                localStorage.setItem('lustroom_jwt_expires_in', data.expires_in);
                localStorage.setItem('lustroom_jwt_obtained_at', Math.floor(Date.now() / 1000));
                
                if (data.user_info) {
                    if (data.user_info.platform_id) {
                        localStorage.setItem('user_platform_id', data.user_info.platform_id);
                    }
                    if (data.user_info.name) {
                        localStorage.setItem('user_name', data.user_info.name);
                    }
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
    let allTiersData = {};
    let currentContentData = null;
    let currentFilterState = { view: 'All', type: 'All', query: '' }; // Added query state
    const userPlatformId = localStorage.getItem('user_platform_id');
    const userName = localStorage.getItem('user_name');

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

    function isRecent(dateString, daysThreshold = 7) {
        if (!dateString) return false;
        try {
            const contentDate = new Date(dateString);
            const now = new Date();
            const thresholdDate = new Date(now.getTime() - (daysThreshold * 24 * 60 * 60 * 1000));
            return contentDate > thresholdDate;
        } catch (error) {
            console.warn('Invalid date string:', dateString);
            return false;
        }
    }

    function hasRecentContent(contentData) {
        return Object.values(contentData)
            .flat()
            .some(link => isRecent(link.added_at));
    }

    // --- STEP 1: Async Guard Functions for Data Caching ---
    async function ensurePlatformsData() {
        if (allPlatformsData.length > 0) {
            return Promise.resolve(allPlatformsData);
        }
        
        const response = await fetch(`${API_BASE_URL}/platforms`);
        const data = await response.json();
        
        if (response.ok && data.status === 'success' && data.platforms) {
            allPlatformsData = data.platforms;
            return allPlatformsData;
        } else {
            throw new Error(data.message || "Failed to fetch platforms.");
        }
    }

    async function ensureTiersData(platformId) {
        if (allTiersData[platformId]) {
            return Promise.resolve(allTiersData[platformId]);
        }
        
        const token = localStorage.getItem('lustroom_jwt');
        const response = await fetch(`${API_BASE_URL}/platforms/${platformId}/tiers`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        
        if (response.ok && data.status === 'success' && data.tiers) {
            allTiersData[platformId] = data.tiers;
            return allTiersData[platformId];
        } else {
            throw new Error(data.message || "Failed to fetch tiers.");
        }
    }

    // --- Skeleton Loaders ---
    function renderPlatformSkeleton() {
        let skeletonHTML = '<h2>Platforms</h2><div class="platforms-grid">';
        for (let i = 0; i < 3; i++) {
            skeletonHTML += `<div class="platform-card-skeleton"><div class="skeleton skeleton-platform-thumbnail"></div><div class="skeleton skeleton-platform-title"></div></div>`;
        }
        skeletonHTML += '</div>';
        mainContent.innerHTML = skeletonHTML;
        document.getElementById('searchContainer').style.display = 'none'; // Ensure search is hidden
    }

    function renderTierSkeleton(platformName) {
        let skeletonHTML = `
            <div class="view-header">
                <button id="backButton" class="back-button">← Back to Platforms</button>
                <h2>${platformName || 'Tiers'}</h2>
            </div>
            <div class="tiers-grid">`;
        for (let i = 0; i < 3; i++) {
            skeletonHTML += `<div class="tier-card-skeleton"><div class="skeleton skeleton-tier-thumbnail"></div><div class="skeleton skeleton-tier-title"></div></div>`;
        }
        skeletonHTML += '</div>';
        mainContent.innerHTML = skeletonHTML;
        document.getElementById('searchContainer').style.display = 'none'; // Ensure search is hidden
        addBackButtonListener('platforms');
    }

    function renderContentSkeleton(tierName, platformName) {
        let skeletonHTML = `
            <div class="view-header">
                <button id="backButton" class="back-button">← Back to Tiers</button>
                <h2>${tierName || 'Content'} <span class="header-breadcrumb">/ ${platformName}</span></h2>
            </div>`;
        for (let i = 0; i < 2; i++) {
            skeletonHTML += `<div class="tier-group"><div class="skeleton skeleton-title"></div><div class="skeleton-card"><div class="skeleton skeleton-thumbnail"></div><div class="skeleton-card-content"><div class="skeleton skeleton-text"></div><div class="skeleton skeleton-text short"></div></div></div></div>`;
        }
        mainContent.innerHTML = skeletonHTML;
        document.getElementById('searchContainer').style.display = 'block'; // Show search in content view
        const searchInput = document.getElementById('searchInput');
        if (searchInput) searchInput.value = ''; // Clear search input
        const urlParams = new URLSearchParams(window.location.search);
        addBackButtonListener('tiers', urlParams.get('platform_id'));
    }

    // --- Modal Logic ---
    const platformModal = document.getElementById('platformModal');

    function showPlatformModal(platform) {
        document.getElementById('modalImage').src = platform.thumbnail_url || '';
        document.getElementById('modalTitle').textContent = platform.name;
        document.getElementById('modalDescription').textContent = platform.description;
        
        const teaserContainer = document.getElementById('modalTeaserContainer');
        if (platform.teaser_video_urls && platform.teaser_video_urls.length > 0) {
            const randomTeaser = platform.teaser_video_urls[Math.floor(Math.random() * platform.teaser_video_urls.length)];
            document.getElementById('modalTeaserVideo').src = randomTeaser;
            teaserContainer.style.display = 'block';
        } else {
            teaserContainer.style.display = 'none';
        }

        const socialsContainer = document.getElementById('modalSocials');
        socialsContainer.innerHTML = '';
        if (platform.social_links && Object.keys(platform.social_links).length > 0) {
            for (const [name, url] of Object.entries(platform.social_links)) {
                const link = document.createElement('a');
                link.href = url;
                link.target = '_blank';
                link.className = 'social-link';
                link.textContent = name.charAt(0).toUpperCase() + name.slice(1);
                socialsContainer.appendChild(link);
            }
        }
        
        document.getElementById('modalContact').innerHTML = platform.contact_info_html || '<p>Contact the provider for access details.</p>';
        platformModal.style.display = 'block';
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

    // --- STEP 3: Simplified View-Rendering Functions ---
    function renderPlatforms(platforms) {
        let platformsHTML = '<div class="platforms-grid">';
        platforms.forEach(platform => {
            const isLocked = platform.id.toString() !== userPlatformId;
            platformsHTML += `<div class="platform-card ${isLocked ? 'locked' : ''}" data-platform-id="${platform.id}"><div class="platform-thumbnail" style="background-image: url('${platform.thumbnail_url || ''}')"></div><div class="platform-name">${platform.name}</div>${isLocked ? '<div class="lock-icon">🔒</div>' : ''}</div>`;
        });
        platformsHTML += '</div>';

        let welcomeHTML = '';
        if (userName) {
            welcomeHTML = `<div class="welcome-message">Welcome back, ${userName}!</div>`;
        }
        
        mainContent.innerHTML = welcomeHTML + '<h2>Platforms</h2>' + platformsHTML;
        document.getElementById('searchContainer').style.display = 'none'; // Ensure search is hidden
        mainContent.querySelector('.platforms-grid').addEventListener('click', handlePlatformClick);
    }
    
    function renderTiers(tiers, platformId, platformName) {
        if (!tiers || !Array.isArray(tiers)) {
            displayError("No tiers data available for this platform.");
            return;
        }
        
        let tiersHTML = `
            <div class="view-header">
                <button id="backButton" class="back-button">← Back to Platforms</button>
                <h2>${platformName} Tiers</h2>
            </div>
            <div class="tiers-grid">`;
        tiers.forEach(tier => {
            tiersHTML += `<div class="tier-card" data-tier-id="${tier.id}"><div class="tier-thumbnail" style="background-image: url('${tier.thumbnail_url || ''}')"></div><div class="tier-name">${tier.name}</div></div>`;
        });
        tiersHTML += '</div>';
        mainContent.innerHTML = tiersHTML;
        document.getElementById('searchContainer').style.display = 'none'; // Ensure search is hidden
        mainContent.querySelector('.tiers-grid').addEventListener('click', (e) => handleTierClick(e, platformId));
        addBackButtonListener('platforms');
    }

    function fetchAndDisplayTiers(platformId, platformName) {
        const tiersData = allTiersData[platformId];
        
        if (!tiersData || !Array.isArray(tiersData)) {
            console.error('Tiers data not found for platform:', platformId, 'Available data:', allTiersData);
            displayError("Unable to load tiers for this platform.");
            return;
        }
        
        renderTiers(tiersData, platformId, platformName);
    }

    // --- Content View Logic ---
    async function fetchAndDisplayContent(platformId, tierId, tierName, platformName) {
        renderContentSkeleton(tierName, platformName);
        try {
            const token = localStorage.getItem('lustroom_jwt');
            const response = await fetch(`${API_BASE_URL}/get_patron_links?tier_id=${tierId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            if (response.ok && data.status === 'success' && data.content) {
                currentContentData = data.content;
                currentFilterState = { view: 'All', type: 'All', query: '' }; // Reset filter state
                
                mainContent.innerHTML = `
                    <div class="view-header">
                        <button id="backButton" class="back-button">← Back to Tiers</button>
                        <h2>${tierName} <span class="header-breadcrumb">/ ${platformName}</span></h2>
                    </div>
                    <div id="filterContainer" class="filter-container"></div>
                    <div id="linksContentContainer"></div>`;
                document.getElementById('searchContainer').style.display = 'block'; // Show search bar
                const searchInput = document.getElementById('searchInput');
                if (searchInput) {
                    searchInput.value = ''; // Clear search input
                    searchInput.addEventListener('input', debounce(handleSearchInput, 300)); // Debounced input handler
                }
                addBackButtonListener('tiers', platformId);
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
        const linksContentContainer = document.getElementById('linksContentContainer');
        if (!linksContentContainer) return;
        linksContentContainer.innerHTML = ''; 
        if (Object.keys(contentData).length === 0) {
            linksContentContainer.innerHTML = `<p class="empty-tier-message">This tier has no content yet. Check back soon!</p>`;
            return;
        }
        let hasVisibleContent = false;
        for (const tierName in contentData) {
            const links = contentData[tierName];
            if (links.length === 0) continue;
            const tierGroup = document.createElement('div');
            tierGroup.className = 'tier-group';
            links.forEach(link => {
                const card = document.createElement('div');
                card.className = 'link-card';
                if (link.locked) card.classList.add('locked');
                if (isRecent(link.added_at)) {
                    card.classList.add('is-new');
                }
                card.dataset.contentType = link.content_type || 'Video';
                if (link.thumbnail_url) {
                    const thumbnailContainer = document.createElement('div');
                    thumbnailContainer.className = 'thumbnail-container';
                    if (isRecent(link.added_at)) {
                        const newBadge = document.createElement('div');
                        newBadge.className = 'new-badge';
                        newBadge.textContent = 'New!';
                        thumbnailContainer.appendChild(newBadge);
                    }
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
            hasVisibleContent = true;
        }
        if (!hasVisibleContent) {
            linksContentContainer.innerHTML = `<p class="empty-tier-message">No content matches your search/filter criteria.</p>`;
        }
    }
    
    // --- NEW: Debounce function for search input ---
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // --- NEW: Handle search input ---
    function handleSearchInput(event) {
        const query = event.target.value.toLowerCase().trim();
        currentFilterState.query = query;
        applyFilters();
    }

    // --- ENHANCED: Setup filters with Recently Added support ---
    function setupFilters(contentData) {
        const filterContainer = document.getElementById('filterContainer');
        if (!filterContainer) return;
        
        const contentTypes = new Set();
        Object.values(contentData).flat().forEach(link => contentTypes.add(link.content_type || 'Video'));
        
        const hasRecent = hasRecentContent(contentData);
        
        if (contentTypes.size <= 1 && !hasRecent) {
            filterContainer.style.display = 'none';
            return;
        }
        
        filterContainer.style.display = 'block';
        filterContainer.innerHTML = '';
        
        const viewFiltersRow = document.createElement('div');
        viewFiltersRow.className = 'filter-row view-filters';
        const typeFiltersRow = document.createElement('div');
        typeFiltersRow.className = 'filter-row type-filters';
        
        const allViewButton = document.createElement('button');
        allViewButton.className = 'filter-btn view-filter active';
        allViewButton.textContent = 'All Content';
        allViewButton.dataset.filter = 'All';
        allViewButton.dataset.filterType = 'view';
        viewFiltersRow.appendChild(allViewButton);
        
        if (hasRecent) {
            const recentButton = document.createElement('button');
            recentButton.className = 'filter-btn view-filter';
            recentButton.textContent = 'Recently Added';
            recentButton.dataset.filter = 'Recent';
            recentButton.dataset.filterType = 'view';
            viewFiltersRow.appendChild(recentButton);
        }
        
        if (contentTypes.size > 1) {
            const allTypeButton = document.createElement('button');
            allTypeButton.className = 'filter-btn type-filter active';
            allTypeButton.textContent = 'All Types';
            allTypeButton.dataset.filter = 'All';
            allTypeButton.dataset.filterType = 'type';
            typeFiltersRow.appendChild(allTypeButton);
            
            contentTypes.forEach(type => {
                const button = document.createElement('button');
                button.className = 'filter-btn type-filter';
                button.textContent = type;
                button.dataset.filter = type;
                button.dataset.filterType = 'type';
                typeFiltersRow.appendChild(button);
            });
        }
        
        filterContainer.appendChild(viewFiltersRow);
        if (typeFiltersRow.children.length > 0) {
            filterContainer.appendChild(typeFiltersRow);
        }
        
        filterContainer.addEventListener('click', handleFilterClick);
    }
    
    // --- ENHANCED: Filter handling with search support ---
    function handleFilterClick(event) {
        if (!event.target.classList.contains('filter-btn')) return;
        
        const filterValue = event.target.dataset.filter;
        const filterType = event.target.dataset.filterType;
        
        if (filterType === 'view') {
            currentFilterState.view = filterValue;
            document.querySelectorAll('.view-filter').forEach(btn => btn.classList.remove('active'));
        } else if (filterType === 'type') {
            currentFilterState.type = filterValue;
            document.querySelectorAll('.type-filter').forEach(btn => btn.classList.remove('active'));
        }
        
        event.target.classList.add('active');
        applyFilters();
    }

    // --- ENHANCED: Apply filters with search support ---
    function applyFilters() {
        const { view, type, query } = currentFilterState;
        
        let hasVisibleContent = false;
        document.querySelectorAll('.link-card').forEach(card => {
            const cardText = (
                (card.querySelector('h3')?.textContent || '') + ' ' + 
                (card.querySelector('p')?.textContent || '')
            ).toLowerCase();
            
            const isViewMatch = (view === 'All') || (view === 'Recent' && card.classList.contains('is-new'));
            const isTypeMatch = (type === 'All') || (card.dataset.contentType === type);
            const isQueryMatch = (query === '') || cardText.includes(query);
            
            const shouldShow = isViewMatch && isTypeMatch && isQueryMatch;
            card.style.display = shouldShow ? 'block' : 'none';
            if (shouldShow) hasVisibleContent = true;
        });
        
        document.querySelectorAll('.tier-group').forEach(group => {
            const hasVisibleCards = group.querySelector('.link-card:not([style*="display: none"])');
            group.style.display = hasVisibleCards ? 'block' : 'none';
        });
        
        const linksContentContainer = document.getElementById('linksContentContainer');
        if (linksContentContainer && !hasVisibleContent) {
            linksContentContainer.innerHTML = `<p class="empty-tier-message">No content matches your search/filter criteria.</p>`;
        }
    }

    // --- STEP 4: Navigation Handlers ---
    function handlePlatformClick(event) {
        const card = event.target.closest('.platform-card');
        if (!card) return;
        const platformId = card.dataset.platformId;
        const platformData = allPlatformsData.find(p => p.id.toString() === platformId);

        if (card.classList.contains('locked')) {
            showPlatformModal(platformData);
        } else {
            history.pushState({view: 'tiers', platformId}, '', `?view=tiers&platform_id=${platformId}`);
            router();
        }
    }

    function handleTierClick(event, platformId) {
        const card = event.target.closest('.tier-card');
        if (!card) return;
        const tierId = card.dataset.tierId;
        
        history.pushState({view: 'content', platformId, tierId}, '', `?view=content&platform_id=${platformId}&tier_id=${tierId}`);
        router();
    }

    function addBackButtonListener(backTo, platformId = null) {
        const backButton = document.getElementById('backButton');
        if (!backButton) return;
        backButton.onclick = () => {
            if (backTo === 'tiers') {
                history.pushState({view: 'tiers', platformId}, '', `?view=tiers&platform_id=${platformId}`);
                router();
            } else {
                history.pushState({view: 'platforms'}, '', `links.html`);
                router();
            }
        };
    }

    // --- STEP 2: Main Application Router ---
    async function router() {
        if (!isTokenValid()) {
            window.location.href = 'login.html';
            return;
        }

        try {
            const urlParams = new URLSearchParams(window.location.search);
            const view = urlParams.get('view');
            const platformId = urlParams.get('platform_id');
            const tierId = urlParams.get('tier_id');

            if (view === 'tiers' || view === 'content') {
                await ensurePlatformsData();
            }
            
            if (view === 'tiers' && platformId) {
                await ensureTiersData(platformId);
            }
            
            if (view === 'content') {
                await ensureTiersData(platformId);
            }

            const platformData = allPlatformsData.find(p => p.id.toString() === platformId);
            const platformName = platformData?.name;
            const tierData = allTiersData[platformId]?.find(t => t.id.toString() === tierId);
            const tierName = tierData?.name;

            if (view === 'content' && platformId && tierId) {
                fetchAndDisplayContent(platformId, tierId, tierName, platformName);
            } else if (view === 'tiers' && platformId) {
                renderTierSkeleton(platformName);
                fetchAndDisplayTiers(platformId, platformName);
            } else {
                renderPlatformSkeleton();
                const platformsData = await ensurePlatformsData();
                renderPlatforms(platformsData);
            }
        } catch (error) {
            console.error("Router error:", error);
            displayError("An error occurred while loading the page. Please try again.");
        }
    }
    
    document.addEventListener('DOMContentLoaded', router);
    window.onpopstate = router;
    
    logoutButton.addEventListener('click', () => {
        localStorage.clear();
        window.location.href = 'login.html';
    });
}