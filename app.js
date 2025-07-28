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
                    // *** NEW: Store user's name for personalization ***
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
    
    // --- State and Data Store (Modified: allTiersData is now an object/map) ---
    let allPlatformsData = [];
    let allTiersData = {}; // Changed from array to object for per-platform caching
    let currentContentData = null; // Store current content for filtering
    let currentFilterState = { view: 'All', type: 'All' }; // Track both view and type filters
    const userPlatformId = localStorage.getItem('user_platform_id');
    const userName = localStorage.getItem('user_name'); // Get user's name

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

    // --- NEW: Date checking utility for recent content ---
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

    // --- NEW: Check if any content in the data is recent ---
    function hasRecentContent(contentData) {
        return Object.values(contentData)
            .flat()
            .some(link => isRecent(link.added_at));
    }

    // --- STEP 1: Async Guard Functions for Data Caching ---
    async function ensurePlatformsData() {
        // Check if data is already cached
        if (allPlatformsData.length > 0) {
            return Promise.resolve(allPlatformsData);
        }
        
        // Fetch data if not cached
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
        // Check if data for this platform is already cached
        if (allTiersData[platformId]) {
            return Promise.resolve(allTiersData[platformId]);
        }
        
        // Fetch data if not cached
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

    // --- STEP 3: Simplified View-Rendering Functions (Made "Dumber") ---
    function renderPlatforms(platforms) {
        let platformsHTML = '<div class="platforms-grid">';
        platforms.forEach(platform => {
            const isLocked = platform.id.toString() !== userPlatformId;
            platformsHTML += `<div class="platform-card ${isLocked ? 'locked' : ''}" data-platform-id="${platform.id}"><div class="platform-thumbnail" style="background-image: url('${platform.thumbnail_url || ''}')"></div><div class="platform-name">${platform.name}</div>${isLocked ? '<div class="lock-icon">🔒</div>' : ''}</div>`;
        });
        platformsHTML += '</div>';

        // *** NEW: Prepend the welcome message ***
        let welcomeHTML = '';
        if (userName) {
            welcomeHTML = `<div class="welcome-message">Welcome back, ${userName}!</div>`;
        }
        
        mainContent.innerHTML = welcomeHTML + '<h2>Platforms</h2>' + platformsHTML;
        mainContent.querySelector('.platforms-grid').addEventListener('click', handlePlatformClick);
    }
    
    function renderTiers(tiers, platformId, platformName) {
        // Add safety check for tiers data
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
        mainContent.querySelector('.tiers-grid').addEventListener('click', (e) => handleTierClick(e, platformId));
        addBackButtonListener('platforms');
    }

    // --- STEP 3: Simplified fetchAndDisplayTiers (no longer fetches, just renders) ---
    function fetchAndDisplayTiers(platformId, platformName) {
        const tiersData = allTiersData[platformId]; // Data is guaranteed to be present
        
        // Add safety check
        if (!tiersData || !Array.isArray(tiersData)) {
            console.error('Tiers data not found for platform:', platformId, 'Available data:', allTiersData);
            displayError("Unable to load tiers for this platform.");
            return;
        }
        
        renderTiers(tiersData, platformId, platformName);
    }

    // --- Content View Logic (Still fetches content as it's view-specific, not global metadata) ---
    async function fetchAndDisplayContent(platformId, tierId, tierName, platformName) {
        renderContentSkeleton(tierName, platformName);
        try {
            const token = localStorage.getItem('lustroom_jwt');
            const response = await fetch(`${API_BASE_URL}/get_patron_links?tier_id=${tierId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            if (response.ok && data.status === 'success' && data.content) {
                currentContentData = data.content; // Store for filtering
                currentFilterState = { view: 'All', type: 'All' }; // Reset filter state
                
                mainContent.innerHTML = `
                    <div class="view-header">
                        <button id="backButton" class="back-button">← Back to Tiers</button>
                        <h2>${tierName} <span class="header-breadcrumb">/ ${platformName}</span></h2>
                    </div>
                    <div id="filterContainer" class="filter-container"></div>
                    <div id="linksContentContainer"></div>`;
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
        for (const tierName in contentData) {
            const links = contentData[tierName];
            if (links.length === 0) continue;
            const tierGroup = document.createElement('div');
            tierGroup.className = 'tier-group';
            links.forEach(link => {
                const card = document.createElement('div');
                card.className = 'link-card';
                if (link.locked) card.classList.add('locked');
                
                // *** NEW: Add new content badge and class ***
                if (isRecent(link.added_at)) {
                    card.classList.add('is-new');
                }
                
                card.dataset.contentType = link.content_type || 'Video';
                if (link.thumbnail_url) {
                    const thumbnailContainer = document.createElement('div');
                    thumbnailContainer.className = 'thumbnail-container';
                    
                    // *** NEW: Add "New!" badge to thumbnail ***
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
        }
    }
    
    // *** ENHANCED: Improved filter setup with Recently Added support ***
    function setupFilters(contentData) {
        const filterContainer = document.getElementById('filterContainer');
        if (!filterContainer) return;
        
        // Get all content types
        const contentTypes = new Set();
        Object.values(contentData).flat().forEach(link => contentTypes.add(link.content_type || 'Video'));
        
        // Check if we have recent content
        const hasRecent = hasRecentContent(contentData);
        
        // Hide filters if only one type and no recent content
        if (contentTypes.size <= 1 && !hasRecent) {
            filterContainer.style.display = 'none';
            return;
        }
        
        filterContainer.style.display = 'block';
        filterContainer.innerHTML = '';
        
        // Create two filter rows
        const viewFiltersRow = document.createElement('div');
        viewFiltersRow.className = 'filter-row view-filters';
        const typeFiltersRow = document.createElement('div');
        typeFiltersRow.className = 'filter-row type-filters';
        
        // View filters (All vs Recently Added)
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
        
        // Type filters (only show if more than one type)
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
    
    // *** ENHANCED: Improved filter handling with dual-state support ***
    function handleFilterClick(event) {
        if (!event.target.classList.contains('filter-btn')) return;
        
        const filterValue = event.target.dataset.filter;
        const filterType = event.target.dataset.filterType;
        
        if (filterType === 'view') {
            // Update view filter state
            currentFilterState.view = filterValue;
            document.querySelectorAll('.view-filter').forEach(btn => btn.classList.remove('active'));
        } else if (filterType === 'type') {
            // Update type filter state
            currentFilterState.type = filterValue;
            document.querySelectorAll('.type-filter').forEach(btn => btn.classList.remove('active'));
        }
        
        event.target.classList.add('active');
        applyFilters();
    }

    // *** ENHANCED: Combined filter application with dual-state support ***
    function applyFilters() {
        const { view, type } = currentFilterState;
        
        document.querySelectorAll('.link-card').forEach(card => {
            let shouldShow = true;
            
            // Apply view filter (All vs Recent)
            if (view === 'Recent') {
                shouldShow = shouldShow && card.classList.contains('is-new');
            }
            
            // Apply type filter (All vs specific content type)
            if (type !== 'All') {
                shouldShow = shouldShow && (card.dataset.contentType === type);
            }
            
            card.style.display = shouldShow ? 'block' : 'none';
        });
        
        // Show/hide tier groups based on visible cards
        document.querySelectorAll('.tier-group').forEach(group => {
            const hasVisibleCards = group.querySelector('.link-card:not([style*="display: none"])');
            group.style.display = hasVisibleCards ? 'block' : 'none';
        });
    }

    // --- STEP 4: Updated Navigation Handlers (Only update state and call router) ---
    function handlePlatformClick(event) {
        const card = event.target.closest('.platform-card');
        if (!card) return;
        const platformId = card.dataset.platformId;
        const platformData = allPlatformsData.find(p => p.id.toString() === platformId);

        if (card.classList.contains('locked')) {
            showPlatformModal(platformData);
        } else {
            history.pushState({view: 'tiers', platformId}, '', `?view=tiers&platform_id=${platformId}`);
            router(); // Let router handle the rest
        }
    }

    function handleTierClick(event, platformId) {
        const card = event.target.closest('.tier-card');
        if (!card) return;
        const tierId = card.dataset.tierId;
        
        history.pushState({view: 'content', platformId, tierId}, '', `?view=content&platform_id=${platformId}&tier_id=${tierId}`);
        router(); // Let router handle the rest
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

    // --- STEP 2: Refactored Main Application Router (Now Async with Data Guards) ---
    async function router() {
        if (!isTokenValid()) {
            window.location.href = 'login.html';
            return;
        }

        // Wrap entire router in try-catch for error handling
        try {
            const urlParams = new URLSearchParams(window.location.search);
            const view = urlParams.get('view');
            const platformId = urlParams.get('platform_id');
            const tierId = urlParams.get('tier_id');

            // STEP 2: Conditionally await guard functions based on URL parameters
            if (view === 'tiers' || view === 'content') {
                await ensurePlatformsData(); // Ensure platforms data is loaded
            }
            
            if (view === 'tiers' && platformId) {
                await ensureTiersData(platformId); // Ensure tiers data for this platform is loaded
            }
            
            if (view === 'content') {
                await ensureTiersData(platformId); // Ensure tiers data for this platform is loaded
            }

            // STEP 2: Safely get names after awaiting guard functions
            const platformData = allPlatformsData.find(p => p.id.toString() === platformId);
            const platformName = platformData?.name;
            
            const tierData = allTiersData[platformId]?.find(t => t.id.toString() === tierId);
            const tierName = tierData?.name;

            // STEP 2: Call rendering functions with safely-retrieved names
            if (view === 'content' && platformId && tierId) {
                fetchAndDisplayContent(platformId, tierId, tierName, platformName);
            } else if (view === 'tiers' && platformId) {
                renderTierSkeleton(platformName); // Show skeleton with correct platform name
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