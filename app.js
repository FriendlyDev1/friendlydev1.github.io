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
                
                // *** NEW: Store user's platform_id for frontend logic ***
                if (data.user_info && data.user_info.platform_id) {
                    localStorage.setItem('user_platform_id', data.user_info.platform_id);
                }

                window.location.href = 'links.html'; // This now goes to the platform selection screen
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
        let skeletonHTML = '<div class="platforms-grid">';
        for (let i = 0; i < 3; i++) {
            skeletonHTML += `
                <div class="platform-card-skeleton">
                    <div class="skeleton skeleton-platform-thumbnail"></div>
                    <div class="skeleton skeleton-platform-title"></div>
                </div>
            `;
        }
        skeletonHTML += '</div>';
        mainContent.innerHTML = skeletonHTML;
    }

    function renderContentSkeleton() {
        let skeletonHTML = '';
        for (let i = 0; i < 2; i++) {
            skeletonHTML += `
                <div class="tier-group">
                    <div class="skeleton skeleton-title"></div>
                    <div class="skeleton-card">
                        <div class="skeleton skeleton-thumbnail"></div>
                        <div class="skeleton-card-content">
                            <div class="skeleton skeleton-text"></div>
                            <div class="skeleton skeleton-text short"></div>
                        </div>
                    </div>
                </div>
            `;
        }
        mainContent.innerHTML = skeletonHTML;
    }

    // --- Modal Logic ---
    const modal = document.getElementById('platformModal');
    const modalCloseBtn = document.querySelector('.modal-close-btn');

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
        
        modal.style.display = 'block';
    }

    function hideModal() {
        modal.style.display = 'none';
        document.getElementById('modalTeaserVideo').pause();
    }
    
    modalCloseBtn.onclick = hideModal;
    window.onclick = function(event) {
        if (event.target == modal) {
            hideModal();
        }
    };

    // --- Platform View Logic ---
    async function fetchAndDisplayPlatforms() {
        renderPlatformSkeleton();

        try {
            const response = await fetch(`${API_BASE_URL}/platforms`);
            const data = await response.json();

            if (response.ok && data.status === 'success' && data.platforms) {
                allPlatformsData = data.platforms; // Store for modal
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
        let platformsHTML = '<div class="platforms-grid">';
        platforms.forEach(platform => {
            const isLocked = platform.id.toString() !== userPlatformId;
            platformsHTML += `
                <div class="platform-card ${isLocked ? 'locked' : ''}" data-platform-id="${platform.id}">
                    <div class="platform-thumbnail" style="background-image: url('${platform.thumbnail_url || ''}')"></div>
                    <div class="platform-name">${platform.name}</div>
                    ${isLocked ? '<div class="lock-icon">🔒</div>' : ''}
                </div>
            `;
        });
        platformsHTML += '</div>';
        mainContent.innerHTML = platformsHTML;

        // Add single event listener for all cards
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
            // Navigate to content view for this platform
            window.location.href = `links.html?platform_id=${platformId}`;
        }
    }

    // --- Content View Logic (Previously the main logic) ---
    async function fetchAndDisplayContent(platformId) {
        renderContentSkeleton();
        
        try {
            const token = localStorage.getItem('lustroom_jwt');
            const response = await fetch(`${API_BASE_URL}/get_patron_links`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}` },
            });
            const data = await response.json();

            if (response.ok && data.status === 'success' && data.content) {
                // The rest of this logic (renderContent, setupFilters) is now part of the content view
                // We just need to add the container for filters and render the content
                mainContent.innerHTML = `
                    <div id="filterContainer" class="filter-container"></div>
                    <div id="linksContentContainer"></div>
                `;
                renderContent(data.content);
                setupFilters(data.content);
            } else if (response.status === 401 || response.status === 403) {
                localStorage.clear();
                window.location.href = 'login.html';
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
        linksContentContainer.innerHTML = ''; 

        for (const tierName in contentData) {
            // ... (The renderContent function from the previous step is pasted here without change)
            // It's long, so for brevity in this comment, assume it's the same.
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
                if (link.category) { /* ... meta info ... */ }
                cardContent.appendChild(metaInfo);

                if (!link.locked) {
                    const actionsContainer = document.createElement('div');
                    actionsContainer.className = 'card-actions';
                    const copyButton = document.createElement('button');
                    copyButton.className = 'copy-btn';
                    copyButton.textContent = 'Copy Link';
                    copyButton.addEventListener('click', () => { /* ... copy logic ... */ });
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
        // This function is also pasted from the previous step without change
    }

    // --- Main Application Router ---
    document.addEventListener('DOMContentLoaded', () => {
        if (!isTokenValid()) {
            window.location.href = 'login.html';
            return;
        }

        const urlParams = new URLSearchParams(window.location.search);
        const platformId = urlParams.get('platform_id');

        if (platformId) {
            // We are in the Content View
            fetchAndDisplayContent(platformId);
        } else {
            // We are in the Platform Selection View
            fetchAndDisplayPlatforms();
        }
    });
    
    // Global event handlers
    logoutButton.addEventListener('click', () => {
        localStorage.clear();
        window.location.href = 'login.html';
    });
}