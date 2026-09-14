// Provider management module

import { providerStats, updateProviderStats } from './constants.js';
import { showToast, formatUptime, getProviderConfigs, getBaseProviderConfigs } from './utils.js';
import { fileUploadHandler } from './file-upload.js';
import { t, getCurrentLanguage } from './i18n.js';
import { renderRoutingExamples } from './routing-examples.js';
import { updateModelsProviderConfigs } from './models-manager.js';
import { updateTutorialProviderConfigs } from './tutorial-manager.js';
import { updateUsageProviderConfigs } from './usage-manager.js';
import { updateConfigProviderConfigs } from './config-manager.js';
import { loadConfigList, updateProviderFilterOptions } from './upload-config-manager.js';
import { setServiceMode } from './event-handlers.js';

// Save initial server time and uptime
let initialServerTime = null;
let initialUptime = null;
let initialLoadTime = null;
let isStaticProviderConfigsUpdated = false;
let cachedSupportedProviders = null;

/**
 * Load system information
 */
async function loadSystemInfo() {
    try {
        const data = await window.apiClient.get('/system');

        const appVersionEl = document.getElementById('appVersion');
        const nodeVersionEl = document.getElementById('nodeVersion');
        const serverTimeEl = document.getElementById('serverTime');
        const memoryUsageEl = document.getElementById('memoryUsage');
        const cpuUsageEl = document.getElementById('cpuUsage');
        const uptimeEl = document.getElementById('uptime');

        if (appVersionEl) appVersionEl.textContent = data.appVersion ? `v${data.appVersion}` : '--';
        
        // Auto-check for updates
        if (data.appVersion) {
            checkUpdate(true);
        }

        if (nodeVersionEl) nodeVersionEl.textContent = data.nodeVersion || '--';
        if (memoryUsageEl) memoryUsageEl.textContent = data.memoryUsage || '--';
        if (cpuUsageEl) cpuUsageEl.textContent = data.cpuUsage || '--';
        
        // Save initial time for local calculation
        if (data.serverTime && data.uptime !== undefined) {
            initialServerTime = new Date(data.serverTime);
            initialUptime = data.uptime;
            initialLoadTime = Date.now();
        }
        
        // Initial display
        if (serverTimeEl) {
            serverTimeEl.textContent = data.serverTime ? new Date(data.serverTime).toLocaleString(getCurrentLanguage()) : '--';
        }
        if (uptimeEl) uptimeEl.textContent = data.uptime ? formatUptime(data.uptime) : '--';

        // Load service mode info
        await loadServiceModeInfo();

    } catch (error) {
        console.error('Failed to load system info:', error);
    }
}

/**
 * Load service running mode info
 */
async function loadServiceModeInfo() {
    try {
        const data = await window.apiClient.get('/service-mode');
        
        const serviceModeEl = document.getElementById('serviceMode');
        const processPidEl = document.getElementById('processPid');
        const platformInfoEl = document.getElementById('platformInfo');
        
        // Update service mode to event-handlers
        setServiceMode(data.mode || 'worker');
        
        // Update restart/reload button display
        updateRestartButton(data.mode);
        
        if (serviceModeEl) {
            const modeText = data.mode === 'worker'
                ? t('dashboard.serviceMode.worker')
                : t('dashboard.serviceMode.standalone');
            const canRestartIcon = data.canAutoRestart
                ? '<i class="fas fa-check-circle" style="color: #10b981; margin-left: 4px;" title="' + t('dashboard.serviceMode.canRestart') + '"></i>'
                : '';
            serviceModeEl.innerHTML = modeText;
        }
        
        if (processPidEl) {
            processPidEl.textContent = data.pid || '--';
        }
        
        if (platformInfoEl) {
            // Format platform info
            const platformMap = {
                'win32': 'Windows',
                'darwin': 'macOS',
                'linux': 'Linux',
                'freebsd': 'FreeBSD'
            };
            platformInfoEl.textContent = platformMap[data.platform] || data.platform || '--';
        }
        
    } catch (error) {
        console.error('Failed to load service mode info:', error);
    }
}

/**
 * Update restart/reload button display based on service mode
 * @param {string} mode - Service mode ('worker' or 'standalone')
 */
function updateRestartButton(mode) {
    const restartBtn = document.getElementById('restartBtn');
    const restartBtnIcon = document.getElementById('restartBtnIcon');
    const restartBtnText = document.getElementById('restartBtnText');
    
    if (!restartBtn) return;
    
    if (mode === 'standalone') {
        // Standalone mode: show "reload" button
        if (restartBtnIcon) {
            restartBtnIcon.className = 'fas fa-sync-alt';
        }
        if (restartBtnText) {
            restartBtnText.textContent = t('header.reload');
            restartBtnText.setAttribute('data-i18n', 'header.reload');
        }
        restartBtn.setAttribute('aria-label', t('header.reload'));
        restartBtn.setAttribute('data-i18n-aria-label', 'header.reload');
        restartBtn.title = t('header.reload');
    } else {
        // Worker mode: show "restart" button
        if (restartBtnIcon) {
            restartBtnIcon.className = 'fas fa-redo';
        }
        if (restartBtnText) {
            restartBtnText.textContent = t('header.restart');
            restartBtnText.setAttribute('data-i18n', 'header.restart');
        }
        restartBtn.setAttribute('aria-label', t('header.restart'));
        restartBtn.setAttribute('data-i18n-aria-label', 'header.restart');
        restartBtn.title = t('header.restart');
    }
}

/**
 * Update server time and uptime display (local calculation)
 */
function updateTimeDisplay() {
    if (!initialServerTime || initialUptime === null || !initialLoadTime) {
        return;
    }

    const serverTimeEl = document.getElementById('serverTime');
    const uptimeEl = document.getElementById('uptime');

    // Calculate elapsed seconds
    const elapsedSeconds = Math.floor((Date.now() - initialLoadTime) / 1000);

    // Update server time
    if (serverTimeEl) {
        const currentServerTime = new Date(initialServerTime.getTime() + elapsedSeconds * 1000);
        serverTimeEl.textContent = currentServerTime.toLocaleString(getCurrentLanguage());
    }

    // Update uptime
    if (uptimeEl) {
        const currentUptime = initialUptime + elapsedSeconds;
        uptimeEl.textContent = formatUptime(currentUptime);
    }
}

/**
 * Load provider data
 * @param {boolean} forceRefreshSupported - Whether to force refresh supported provider list
 */
async function loadProviders(forceRefreshSupported = false) {
    try {
        // Get merged data (including providers and supportedProviders)
        const data = await window.apiClient.get('/providers');
        if (!data || !data.providers) return;

        const { providers, supportedProviders } = data;
        
        // Check if the supported list has changed (or is not yet initialized)
        const isChanged = !cachedSupportedProviders || 
                         supportedProviders.length !== cachedSupportedProviders.length ||
                         supportedProviders.some((p, i) => p !== cachedSupportedProviders[i]);

        // If force refresh or object type (possibly triggered by event), also consider as refresh needed
        const shouldForce = forceRefreshSupported === true || (typeof forceRefreshSupported === 'object');

        if (isChanged || shouldForce) {
            cachedSupportedProviders = supportedProviders;
            const providerConfigs = getProviderConfigs(cachedSupportedProviders);
            
            // Dynamically update provider info across pages
            updateModelsProviderConfigs(providerConfigs);
            updateTutorialProviderConfigs(providerConfigs);
            updateUsageProviderConfigs(providerConfigs);
            updateConfigProviderConfigs(providerConfigs);
            updateProviderFilterOptions(providerConfigs);
            renderRoutingExamples(providerConfigs);
            
            isStaticProviderConfigsUpdated = true;
        }

        renderProviders(providers, cachedSupportedProviders);
    } catch (error) {
        console.error('Failed to load providers:', error);
    }
}

/**
 * Render provider list
 * @param {Object} providers - Provider data
 * @param {string[]} supportedProviders - Registered provider type list
 */
function renderProviders(providers, supportedProviders = []) {
    const container = document.getElementById('providersList');
    if (!container) return;
    
    container.innerHTML = '';

    // Check if there is provider pool data
    const hasProviders = Object.keys(providers).length > 0;
    const statsGrid = document.querySelector('#providers .stats-grid');
    
    // Always show stat cards
    if (statsGrid) statsGrid.style.display = 'grid';
    
    const providerConfigs = getProviderConfigs(supportedProviders);
    
    // Extract display ID order
    const providerDisplayOrder = providerConfigs.filter(c => c.visible !== false).map(c => c.id);
    
    // Build ID to config mapping for easy display name lookup
    const configMap = providerConfigs.reduce((map, config) => {
        map[config.id] = config;
        return map;
    }, {});
    
    // Get all provider types and sort in specified order
    // Prioritize showing all predefined provider types, even if some have no data
    let allProviderTypes;
    if (hasProviders) {
        // Merge predefined types and actual existing types to ensure all predefined providers are shown
        const actualProviderTypes = Object.keys(providers);
        // Keep only those marked as visible in config, or not in config (default show)
        allProviderTypes = [...new Set([...providerDisplayOrder, ...actualProviderTypes])];
    } else {
        allProviderTypes = providerDisplayOrder;
    }

    // Filter out providers explicitly set to not display
    const sortedProviderTypes = providerDisplayOrder.filter(type => allProviderTypes.includes(type))
        .concat(allProviderTypes.filter(type => !providerDisplayOrder.some(t => t === type) && !configMap[type]?.visible === false));
    
    // Calculate totals
    let totalAccounts = 0;
    let totalHealthy = 0;
    
    // Get search keyword
    const searchInput = document.getElementById('providerSearchInput');
    const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';

    // Render by sorted provider types
    sortedProviderTypes.forEach((providerType) => {
        // Skip if config explicitly sets to not display
        if (configMap[providerType] && configMap[providerType].visible === false) {
            return;
        }

        const accounts = hasProviders ? providers[providerType] || [] : [];

        // Search filter logic
        if (searchTerm) {
            const displayName = (configMap[providerType]?.name || providerType).toLowerCase();
            const matchesType = displayName.includes(searchTerm) || providerType.toLowerCase().includes(searchTerm);
            const matchesNodes = accounts.some(acc => 
                (acc.customName || '').toLowerCase().includes(searchTerm) || 
                (acc.uuid || '').toLowerCase().includes(searchTerm) ||
                (acc.model || '').toLowerCase().includes(searchTerm)
            );
            
            if (!matchesType && !matchesNodes) {
                return;
            }
        }

        const providerDiv = document.createElement('div');
        providerDiv.className = 'provider-item';
        providerDiv.dataset.providerType = providerType;
        providerDiv.style.cursor = 'pointer';

        const healthyCount = accounts.filter(acc => acc.isHealthy && !acc.isDisabled).length;
        const totalCount = accounts.length;
        const usageCount = accounts.reduce((sum, acc) => sum + (acc.usageCount || 0), 0);
        const errorCount = accounts.reduce((sum, acc) => sum + (acc.errorCount || 0), 0);
        
        totalAccounts += totalCount;
        totalHealthy += healthyCount;

        // Update global stats variables
        if (!providerStats.providerTypeStats[providerType]) {
            providerStats.providerTypeStats[providerType] = {
                totalAccounts: 0,
                healthyAccounts: 0,
                totalUsage: 0,
                totalErrors: 0,
                lastUpdate: null
            };
        }
        
        const typeStats = providerStats.providerTypeStats[providerType];
        typeStats.totalAccounts = totalCount;
        typeStats.healthyAccounts = healthyCount;
        typeStats.totalUsage = usageCount;
        typeStats.totalErrors = errorCount;
        typeStats.lastUpdate = new Date().toISOString();

        // Set special styles for empty state
        const isEmptyState = !hasProviders || totalCount === 0;
        const statusClass = isEmptyState ? 'status-empty' : (healthyCount === totalCount ? 'status-healthy' : 'status-unhealthy');
        const statusIcon = isEmptyState ? 'fa-info-circle' : (healthyCount === totalCount ? 'fa-check-circle' : 'fa-exclamation-triangle');
        const statusText = isEmptyState ? t('providers.status.empty') : t('providers.status.healthy', { healthy: healthyCount, total: totalCount });

        // Get display name
        const displayName = configMap[providerType]?.name || providerType;

        providerDiv.innerHTML = `
            <div class="provider-header">
                <div class="provider-name">
                    <span class="provider-type-text">${displayName}</span>
                </div>
                <div class="provider-header-right">
                    ${generateAddGroupButton(providerType)}
                    ${generateAuthButton(providerType)}
                    <div class="provider-status ${statusClass}">
                        <i class="fas fa-${statusIcon}"></i>
                        <span>${statusText}</span>
                    </div>
                </div>
            </div>
            <div class="provider-stats">
                <div class="provider-stat">
                    <span class="provider-stat-label" data-i18n="providers.stat.totalAccounts">${t('providers.stat.totalAccounts')}</span>
                    <span class="provider-stat-value">${totalCount}</span>
                </div>
                <div class="provider-stat">
                    <span class="provider-stat-label" data-i18n="providers.stat.healthyAccounts">${t('providers.stat.healthyAccounts')}</span>
                    <span class="provider-stat-value">${healthyCount}</span>
                </div>
                <div class="provider-stat">
                    <span class="provider-stat-label" data-i18n="providers.stat.usageCount">${t('providers.stat.usageCount')}</span>
                    <span class="provider-stat-value">${usageCount}</span>
                </div>
                <div class="provider-stat">
                    <span class="provider-stat-label" data-i18n="providers.stat.errorCount">${t('providers.stat.errorCount')}</span>
                    <span class="provider-stat-value">${errorCount}</span>
                </div>
            </div>
        `;

        // If empty state, add special class
        if (isEmptyState) {
            providerDiv.classList.add('empty-provider');
        }

        // Add click event - entire provider group is clickable
        providerDiv.addEventListener('click', (e) => {
            e.preventDefault();
            openProviderManager(providerType);
        });

        container.appendChild(providerDiv);
        
        // Add event listener for add-group button
        const addGroupBtn = providerDiv.querySelector('.add-group-btn');
        if (addGroupBtn) {
            addGroupBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                
                // Use custom themed prompt
                showSimplePrompt(
                    t('providers.addGroup.title'),
                    t('providers.addGroup.suffixPlaceholder'),
                    async (suffix) => {
                        const cleanSuffix = suffix.toLowerCase().replace(/[^a-z0-9]/g, '');
                        if (!cleanSuffix) {
                            showToast(t('common.warning'), t('common.invalidSuffix'), 'warning');
                            return;
                        }
                        
                        const newProviderType = `${providerType}-${cleanSuffix}`;
                        
                        // Show loading state
                        addGroupBtn.disabled = true;
                        const originalHtml = addGroupBtn.innerHTML;
                        addGroupBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                        
                        try {
                            const response = await window.apiClient.post('/providers', {
                                providerType: newProviderType,
                                providerConfig: {
                                    customName: cleanSuffix.toUpperCase(),
                                    isHealthy: true,
                                    isDisabled: false,
                                    usageCount: 0,
                                    errorCount: 0
                                }
                            });
                            
                            if (response.success) {
                                showToast(t('common.success'), t('providers.addGroup.success'), 'success');
                                await loadProviders(true);
                                setTimeout(() => openProviderManager(newProviderType), 500);
                            } else {
                                throw new Error(response.error?.message || 'Unknown error');
                            }
                        } catch (error) {
                            console.error('Failed to add provider group:', error);
                            showToast(t('common.error'), t('providers.addGroup.error') + ': ' + error.message, 'error');
                            addGroupBtn.disabled = false;
                            addGroupBtn.innerHTML = originalHtml;
                        }
                    }
                );
            });
        }

        // Add event listener for auth button
        const authBtn = providerDiv.querySelector('.generate-auth-btn');
        if (authBtn) {
            authBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent event bubbling to parent
                handleGenerateAuthUrl(providerType);
            });
        }
    });

    // Update stat card data
    const activeProviders = hasProviders ? Object.keys(providers).length : 0;
    updateProviderStatsDisplay(activeProviders, totalHealthy, totalAccounts);

    // Render dashboard provider status overview
    renderProviderStatusOverview(providers, configMap, sortedProviderTypes);
}

/**
 * Jump to a specific provider node
 * @param {string} type - Provider type
 * @param {string} uuid - Node UUID
 * @param {Event} event - Event object
 */
window.jumpToProviderNode = function(type, uuid, event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    
    // Switch to providers page
    const providersNav = document.querySelector('[data-section="providers"]');
    if (providersNav) {
        providersNav.click();
        // Delay execution to ensure page switch completes
        setTimeout(() => {
            openProviderManager(type, uuid);
        }, 100);
    }
};

/**
 * Render dashboard provider status overview
 * @param {Object} providers - Provider data
 * @param {Object} configMap - Provider config mapping
 * @param {Array} sortedProviderTypes - Sorted provider types
 */
function renderProviderStatusOverview(providers, configMap, sortedProviderTypes) {
    const grid = document.getElementById('providerStatusGrid');
    const panel = document.querySelector('.provider-status-panel');
    if (!grid || !panel) return;

    // Check if there are any actually displayable provider nodes
    let hasVisibleNodes = false;
    const validProviderTypes = [];

    sortedProviderTypes.forEach(type => {
        const accounts = providers[type] || [];
        if (accounts.length > 0) {
            hasVisibleNodes = true;
            validProviderTypes.push(type);
        }
    });

    if (!hasVisibleNodes) {
        panel.style.display = 'none';
        
        // When no data, auto-expand dashboard advanced info (path routing examples, etc.)
        const dashboardDetails = document.querySelector('.dashboard-details');
        if (dashboardDetails) {
            dashboardDetails.open = true;
        }
        return;
    }

    panel.style.display = 'block';
    grid.innerHTML = '';

    validProviderTypes.forEach(type => {
        const accounts = providers[type];
        const displayName = configMap[type]?.name || type;
        const card = document.createElement('div');
        card.className = 'provider-status-card';
        card.style.cursor = 'pointer';
        card.addEventListener('click', () => {
            // Click to navigate to provider management page and open management modal for the type
            const providersNav = document.querySelector('[data-section="providers"]');
            if (providersNav) {
                providersNav.click();
                setTimeout(() => openProviderManager(type), 100);
            }
        });

        const healthyCount = accounts.filter(acc => acc.isHealthy && !acc.isDisabled).length;
        const totalCount = accounts.length;
        const disabledCount = accounts.filter(acc => acc.isDisabled).length;
        const unhealthyCount = totalCount - healthyCount - disabledCount;

        const totalUsage = accounts.reduce((sum, acc) => sum + (acc.usageCount || 0), 0);
        const totalErrors = accounts.reduce((sum, acc) => sum + (acc.errorCount || 0), 0);

        card.innerHTML = `
            <div class="provider-info">
                <span class="provider-name" title="${displayName}">${displayName}</span>
                <span class="provider-count" style="font-size: 0.75rem; color: var(--text-secondary);">${healthyCount}/${totalCount}</span>
            </div>
            
            <div class="provider-nodes-summary">
                <span style="color: #10b981;"><i class="fas fa-check"></i> ${healthyCount}</span>
                <span style="color: #ef4444; ${unhealthyCount === 0 ? 'opacity: 0.3;' : ''}"><i class="fas fa-times"></i> ${unhealthyCount}</span>
                <span style="color: #9ca3af; ${disabledCount === 0 ? 'opacity: 0.3;' : ''}"><i class="fas fa-minus-circle"></i> ${disabledCount}</span>
            </div>

            <div class="node-dots">
                ${accounts.map(acc => {
                    let statusClass = 'healthy';
                    let statusTitle = acc.customName || acc.uuid;
                    if (acc.isDisabled) {
                        statusClass = 'disabled';
                        statusTitle += ` (${t('modal.provider.status.disabled')})`;
                    } else if (!acc.isHealthy) {
                        statusClass = 'unhealthy';
                        statusTitle += ` (${t('modal.provider.status.unhealthy')})`;
                    } else {
                        statusTitle += ` (${t('modal.provider.status.healthy')})`;
                    }
                    // Add tooltip info: usage and errors
                    statusTitle += `\n${t('providers.stat.usageCount')}: ${acc.usageCount || 0}\n${t('providers.stat.errorCount')}: ${acc.errorCount || 0}`;
                    
                    // Create HTML string for dot, add click jump event
                    return `<span class="node-dot ${statusClass}" title="${statusTitle}" onclick="window.jumpToProviderNode('${type}', '${acc.uuid}', event)"></span>`;
                }).join('')}
            </div>
            <div class="provider-stats-summary">
                <span><i class="fas fa-paper-plane" style="font-size: 0.7rem; opacity: 0.7;"></i> ${totalUsage}</span>
                <span><i class="fas fa-exclamation-circle" style="font-size: 0.7rem; opacity: 0.7;"></i> ${totalErrors}</span>
                <span class="success-rate">${totalUsage > 0 ? ((totalUsage - totalErrors) / totalUsage * 100).toFixed(1) + '%' : '--'}</span>
            </div>
        `;
        grid.appendChild(card);
    });
}

/**
 * Update provider stats display
 * @param {number} activeProviders - Number of active providers
 * @param {number} healthyProviders - Number of healthy providers
 * @param {number} totalAccounts - Total number of accounts
 */
function updateProviderStatsDisplay(activeProviders, healthyProviders, totalAccounts) {
    // Update global stats variables
    const newStats = {
        activeProviders,
        healthyProviders,
        totalAccounts,
        lastUpdateTime: new Date().toISOString()
    };
    
    updateProviderStats(newStats);
    
    // Calculate total requests and errors
    let totalUsage = 0;
    let totalErrors = 0;
    Object.values(providerStats.providerTypeStats).forEach(typeStats => {
        totalUsage += typeStats.totalUsage || 0;
        totalErrors += typeStats.totalErrors || 0;
    });
    
    const finalStats = {
        ...newStats,
        totalRequests: totalUsage,
        totalErrors: totalErrors
    };
    
    updateProviderStats(finalStats);
    
    // Revised: count "active providers" and "active connections" by usage
    // "Active providers": count provider types with usageCount > 0
    let activeProvidersByUsage = 0;
    Object.entries(providerStats.providerTypeStats).forEach(([providerType, typeStats]) => {
        if (typeStats.totalUsage > 0) {
            activeProvidersByUsage++;
        }
    });
    
    // "Active connections": sum of usage counts across all provider accounts
    const activeConnections = totalUsage;
    
    // Update page display
    const activeProvidersEl = document.getElementById('activeProviders');
    const healthyProvidersEl = document.getElementById('healthyProviders');
    const activeConnectionsEl = document.getElementById('activeConnections');
    
    if (activeProvidersEl) activeProvidersEl.textContent = activeProvidersByUsage;
    if (healthyProvidersEl) healthyProvidersEl.textContent = healthyProviders;
    if (activeConnectionsEl) activeConnectionsEl.textContent = activeConnections;
    
    // Print debug info to console
    console.log('Provider Stats Updated:', {
        activeProviders,
        activeProvidersByUsage,
        healthyProviders,
        totalAccounts,
        totalUsage,
        totalErrors,
        providerTypeStats: providerStats.providerTypeStats
    });
}

/**
 * Open provider management modal
 * @param {string} providerType - Provider type
 */
/**
 * Open provider management modal
 * @param {string} providerType - Provider type
 * @param {string} searchTerm - Initial search term
 */
async function openProviderManager(providerType, searchTerm = '') {
    try {
        const data = await window.apiClient.get(`/providers/${encodeURIComponent(providerType)}`);
        
        showProviderManagerModal(data, searchTerm);
    } catch (error) {
        console.error('Failed to load provider details:', error);
        showToast(t('common.error'), t('modal.provider.load.failed'), 'error');
    }
}

/**
 * Generate auth button HTML
 * @param {string} providerType - Provider type
 * @returns {string} Auth button HTML
 */
function generateAuthButton(providerType) {
    // Only show auth button for OAuth-supported providers
    const oauthProviders = ['gemini-cli-oauth', 'gemini-antigravity', 'openai-qwen-oauth', 'claude-kiro-oauth', 'openai-iflow', 'openai-codex-oauth'];

    if (!oauthProviders.includes(providerType)) {
        return '';
    }

    // Codex provider uses special icon
    if (providerType === 'openai-codex-oauth') {
        return `
            <button class="generate-auth-btn" title="Generate Codex OAuth authorization link">
                <i class="fas fa-key"></i>
                <span data-i18n="providers.auth.generate">${t('providers.auth.generate')}</span>
            </button>
        `;
    }

    return `
        <button class="generate-auth-btn" title="Generate OAuth authorization link">
            <i class="fas fa-key"></i>
            <span data-i18n="providers.auth.generate">${t('providers.auth.generate')}</span>
        </button>
    `;
}

/**
 * Show a minimal themed input prompt
 * @param {string} title - Title
 * @param {string} placeholder - Placeholder
 * @param {function} callback - Confirm callback
 */
function showSimplePrompt(title, placeholder, callback) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.display = 'flex';
    overlay.style.zIndex = '3000';

    overlay.innerHTML = `
        <div class="modal-content" style="max-width: 320px; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); border: 1px solid var(--border-color); padding: 20px;">
            <div style="margin-bottom: 12px; font-weight: 600; font-size: 14px; color: var(--text-primary);">${title}</div>
            <div style="display: flex; gap: 8px;">
                <input type="text" id="simple-prompt-input" placeholder="${placeholder}" style="flex: 1; padding: 8px 12px; border: 1.5px solid var(--border-color); border-radius: 6px; font-size: 13px; outline: none;">
                <button id="simple-prompt-submit" class="btn btn-primary btn-sm" style="padding: 0 12px; height: 34px; border-radius: 6px; font-size: 13px;">${t('common.confirm')}</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    const input = overlay.querySelector('#simple-prompt-input');
    const submitBtn = overlay.querySelector('#simple-prompt-submit');
    
    input.focus();
    
    const finish = () => {
        const val = input.value.trim();
        if (val) {
            overlay.remove();
            callback(val);
        }
    };
    
    submitBtn.onclick = finish;
    input.onkeydown = (e) => {
        if (e.key === 'Enter') finish();
        if (e.key === 'Escape') overlay.remove();
    };
    overlay.onclick = (e) => {
        if (e.target === overlay) overlay.remove();
    };
}

/**
 * Generate add-group button HTML
 * @param {string} providerType - Provider type
 * @returns {string} Button HTML
 */
function generateAddGroupButton(providerType) {
    const allowedTypes = ['claude-custom', 'openai-custom', 'openaiResponses-custom'];
    if (!allowedTypes.includes(providerType)) {
        return '';
    }

    return `
        <button class="add-group-btn" title="${t('providers.addGroup.title')}">
            <i class="fas fa-folder-plus"></i>
            <span data-i18n="providers.addGroup">${t('providers.addGroup')}</span>
        </button>
    `;
}

/**
 * Handle generating authorization URL
 * @param {string} providerType - Provider type
 */
async function handleGenerateAuthUrl(providerType) {
    // If Kiro OAuth, show auth method selector dialog first
    if (providerType === 'claude-kiro-oauth') {
        showKiroAuthMethodSelector(providerType);
        return;
    }

    // If Gemini OAuth or Antigravity, show auth method selector dialog
    if (providerType === 'gemini-cli-oauth' || providerType === 'gemini-antigravity') {
        showGeminiAuthMethodSelector(providerType);
        return;
    }

    // If Codex OAuth, show auth method selector dialog
    if (providerType === 'openai-codex-oauth') {
        showCodexAuthMethodSelector(providerType);
        return;
    }

    await executeGenerateAuthUrl(providerType, {});
}

/**
 * Show Codex OAuth auth method selector dialog
 * @param {string} providerType - Provider type
 */
function showCodexAuthMethodSelector(providerType) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.display = 'flex';
    
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 500px;">
            <div class="modal-header">
                <h3><i class="fas fa-key"></i> <span data-i18n="oauth.gemini.selectMethod">${t('oauth.gemini.selectMethod')}</span></h3>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <div class="auth-method-options" style="display: flex; flex-direction: column; gap: 12px;">
                    <button class="auth-method-btn" data-method="oauth" style="display: flex; align-items: center; gap: 12px; padding: 16px; border: 2px solid #e0e0e0; border-radius: 8px; background: white; cursor: pointer; transition: all 0.2s;">
                        <i class="fab fa-google" style="font-size: 24px; color: #4285f4;"></i>
                        <div style="text-align: left;">
                            <div style="font-weight: 600; color: #333;" data-i18n="oauth.gemini.oauth">${t('oauth.gemini.oauth')}</div>
                            <div style="font-size: 12px; color: #666;" data-i18n="oauth.gemini.oauthDesc">${t('oauth.gemini.oauthDesc')}</div>
                        </div>
                    </button>
                    <button class="auth-method-btn" data-method="batch-import" style="display: flex; align-items: center; gap: 12px; padding: 16px; border: 2px solid #e0e0e0; border-radius: 8px; background: white; cursor: pointer; transition: all 0.2s;">
                        <i class="fas fa-file-import" style="font-size: 24px; color: #10b981;"></i>
                        <div style="text-align: left;">
                            <div style="font-weight: 600; color: #333;" data-i18n="oauth.codex.batchImport">${t('oauth.codex.batchImport')}</div>
                            <div style="font-size: 12px; color: #666;" data-i18n="oauth.codex.batchImportDesc">${t('oauth.codex.batchImportDesc')}</div>
                        </div>
                    </button>
                </div>
            </div>
            <div class="modal-footer">
                <button class="modal-cancel" data-i18n="modal.provider.cancel">${t('modal.provider.cancel')}</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Close button event
    const closeBtn = modal.querySelector('.modal-close');
    const cancelBtn = modal.querySelector('.modal-cancel');
    [closeBtn, cancelBtn].forEach(btn => {
        btn.addEventListener('click', () => {
            modal.remove();
        });
    });
    
    // Auth method selection button events
    const methodBtns = modal.querySelectorAll('.auth-method-btn');
    methodBtns.forEach(btn => {
        btn.addEventListener('mouseenter', () => {
            btn.style.borderColor = '#4285f4';
            btn.style.background = '#f8faff';
        });
        btn.addEventListener('mouseleave', () => {
            btn.style.borderColor = '#e0e0e0';
            btn.style.background = 'white';
        });
        btn.addEventListener('click', async () => {
            const method = btn.dataset.method;
            modal.remove();
            
            if (method === 'batch-import') {
                showCodexBatchImportModal(providerType);
            } else {
                await executeGenerateAuthUrl(providerType, {});
            }
        });
    });
}

/**
 * Show Codex batch import modal
 * @param {string} providerType - Provider type
 */
function showCodexBatchImportModal(providerType) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.display = 'flex';
    
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 600px;">
            <div class="modal-header">
                <h3><i class="fas fa-file-import"></i> <span data-i18n="oauth.codex.batchImport">${t('oauth.codex.batchImport')}</span></h3>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <div class="batch-import-instructions" style="margin-bottom: 16px; padding: 12px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px;">
                    <p style="margin: 0; font-size: 14px; color: #1e40af;">
                        <i class="fas fa-info-circle"></i>
                        <span data-i18n="oauth.codex.importInstructions">${t('oauth.codex.importInstructions')}</span>
                    </p>
                </div>
                <div class="form-group">
                    <label for="batchCodexTokens" style="display: block; margin-bottom: 8px; font-weight: 600; color: #374151;">
                        <span data-i18n="oauth.codex.tokensLabel">${t('oauth.codex.tokensLabel')}</span>
                    </label>
                    <textarea 
                        id="batchCodexTokens" 
                        rows="10" 
                        style="width: 100%; padding: 12px; border: 1px solid #d1d5db; border-radius: 8px; font-family: monospace; font-size: 13px; resize: vertical;"
                        placeholder='${t('oauth.codex.tokensPlaceholder')}'
                        data-i18n-placeholder="oauth.codex.tokensPlaceholder"
                    ></textarea>
                </div>
                <div class="form-group" style="margin-top: 12px; margin-bottom: 16px;">
                    <details style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px;">
                        <summary style="padding: 12px; cursor: pointer; font-weight: 600; color: #374151; user-select: none;">
                            <i class="fas fa-code" style="color: #4285f4; margin-right: 8px;"></i>
                            <span data-i18n="oauth.codex.jsonExample">${t('oauth.codex.jsonExample')}</span>
                        </summary>
                        <div style="padding: 12px; background: #1f2937; border-radius: 0 0 8px 8px;">
                            <div style="color: #10b981; font-family: monospace; font-size: 12px;">
                                <div style="color: #9ca3af; margin-bottom: 8px;">// Single credential import example:</div>
                                <pre style="margin: 0; white-space: pre; overflow-x: auto;">{
  "access_token": "eyJhbG...",
  "id_token": "eyJhbG...",
  "refresh_token": "...",
  "token_type": "Bearer",
  "expires_in": 3600
}</pre>
                            </div>
                            <div style="color: #10b981; font-family: monospace; font-size: 12px; margin-top: 16px;">
                                <div style="color: #9ca3af; margin-bottom: 8px;">// Batch import example (JSON array):</div>
                                <pre style="margin: 0; white-space: pre; overflow-x: auto;">[
  {
    "access_token": "token1...",
    "id_token": "id1..."
  },
  {
    "access_token": "token2...",
    "id_token": "id2..."
  }
]</pre>
                            </div>
                        </div>
                    </details>
                </div>
                <div class="batch-import-stats" id="codexBatchStats" style="display: none; margin-top: 12px; padding: 12px; background: #f3f4f6; border-radius: 8px;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span data-i18n="oauth.codex.tokenCount">${t('oauth.codex.tokenCount')}</span>
                        <span id="codexTokenCountValue" style="font-weight: 600;">0</span>
                    </div>
                </div>
                <div class="batch-import-progress" id="codexBatchProgress" style="display: none; margin-top: 16px;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <i class="fas fa-spinner fa-spin" style="color: #4285f4;"></i>
                        <span data-i18n="oauth.codex.importing">${t('oauth.codex.importing')}</span>
                    </div>
                    <div class="progress-bar" style="margin-top: 8px; height: 8px; background: #e5e7eb; border-radius: 4px; overflow: hidden;">
                        <div id="codexImportProgressBar" style="height: 100%; width: 0%; background: #4285f4; transition: width 0.3s;"></div>
                    </div>
                </div>
                <div class="batch-import-result" id="codexBatchResult" style="display: none; margin-top: 16px; padding: 12px; border-radius: 8px;"></div>
            </div>
            <div class="modal-footer">
                <button class="modal-cancel" data-i18n="modal.provider.cancel">${t('modal.provider.cancel')}</button>
                <button class="btn btn-primary batch-import-submit" id="codexBatchSubmit">
                    <i class="fas fa-upload"></i>
                    <span data-i18n="oauth.codex.startImport">${t('oauth.codex.startImport')}</span>
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    const textarea = modal.querySelector('#batchCodexTokens');
    const statsDiv = modal.querySelector('#codexBatchStats');
    const tokenCountValue = modal.querySelector('#codexTokenCountValue');
    const progressDiv = modal.querySelector('#codexBatchProgress');
    const progressBar = modal.querySelector('#codexImportProgressBar');
    const resultDiv = modal.querySelector('#codexBatchResult');
    const submitBtn = modal.querySelector('#codexBatchSubmit');
    const closeBtn = modal.querySelector('.modal-close');
    const cancelBtn = modal.querySelector('.modal-cancel');
    
    // Real-time token count
    textarea.addEventListener('input', () => {
        try {
            const val = textarea.value.trim();
            if (!val) {
                statsDiv.style.display = 'none';
                return;
            }
            const data = JSON.parse(val);
            const tokens = Array.isArray(data) ? data : [data];
            statsDiv.style.display = 'block';
            tokenCountValue.textContent = tokens.length;
        } catch (e) {
            statsDiv.style.display = 'none';
        }
    });
    
    // Close button event
    [closeBtn, cancelBtn].forEach(btn => {
        btn.addEventListener('click', () => {
            modal.remove();
        });
    });
    
    // Submit button event
    submitBtn.addEventListener('click', async () => {
        let tokens = [];
        try {
            const val = textarea.value.trim();
            const data = JSON.parse(val);
            tokens = Array.isArray(data) ? data : [data];
        } catch (e) {
            showToast(t('common.error'), t('oauth.codex.noTokens'), 'error');
            return;
        }
        
        if (tokens.length === 0) {
            showToast(t('common.warning'), t('oauth.codex.noTokens'), 'warning');
            return;
        }
        
        // Disable input and buttons
        textarea.disabled = true;
        submitBtn.disabled = true;
        cancelBtn.disabled = true;
        progressDiv.style.display = 'block';
        resultDiv.style.display = 'none';
        progressBar.style.width = '0%';
        
        // Create real-time result display area
        resultDiv.style.cssText = 'display: block; margin-top: 16px; padding: 12px; border-radius: 8px; background: #f3f4f6; border: 1px solid #d1d5db;';
        resultDiv.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                <i class="fas fa-spinner fa-spin" style="color: #4285f4;"></i>
                <strong id="codexBatchProgressText">${t('oauth.codex.importingProgress', { current: 0, total: tokens.length })}</strong>
            </div>
            <div id="codexBatchResultsList" style="max-height: 200px; overflow-y: auto; font-size: 12px; margin-top: 8px;"></div>
        `;
        
        const progressText = resultDiv.querySelector('#codexBatchProgressText');
        const resultsList = resultDiv.querySelector('#codexBatchResultsList');
        
        let importSuccess = false; // Track whether import succeeded

        try {
            const response = await fetch('/api/codex/batch-import-tokens', {
                method: 'POST',
                headers: window.apiClient ? window.apiClient.getAuthHeaders() : {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ tokens })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                
                let eventType = '';
                let eventData = '';
                
                for (const line of lines) {
                    if (line.startsWith('event: ')) {
                        eventType = line.substring(7).trim();
                    } else if (line.startsWith('data: ')) {
                        eventData = line.substring(6).trim();
                        
                        if (eventType && eventData) {
                            try {
                                const data = JSON.parse(eventData);
                                
                                if (eventType === 'progress') {
                                    const { index, total, current } = data;
                                    const percentage = Math.round((index / total) * 100);
                                    progressBar.style.width = `${percentage}%`;
                                    progressText.textContent = t('oauth.codex.importingProgress', { current: index, total: total });
                                    
                                    const resultItem = document.createElement('div');
                                    resultItem.style.cssText = 'padding: 4px 0; border-bottom: 1px solid rgba(0,0,0,0.1);';
                                    if (current.success) {
                                        resultItem.innerHTML = `Token ${current.index}: <span style="color: #166534;">✓ ${current.path}</span>`;
                                    } else if (current.error === 'duplicate') {
                                        resultItem.innerHTML = `Token ${current.index}: <span style="color: #d97706;">⚠ ${t('oauth.kiro.duplicateToken')}</span>
                                            ${current.existingPath ? `<span style="color: #666; font-size: 11px;">(${current.existingPath})</span>` : ''}`;
                                    } else {
                                        resultItem.innerHTML = `Token ${current.index}: <span style="color: #991b1b;">✗ ${current.error}</span>`;
                                    }
                                    resultsList.appendChild(resultItem);
                                    resultsList.scrollTop = resultsList.scrollHeight;
                                } else if (eventType === 'complete') {
                                    progressBar.style.width = '100%';
                                    progressDiv.style.display = 'none';
                                    
                                    const isAllSuccess = data.failedCount === 0;
                                    const isAllFailed = data.successCount === 0;
                                    let resultClass, resultIcon, resultMessage;
                                    
                                    if (isAllSuccess) {
                                        resultClass = 'background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534;';
                                        resultIcon = 'fa-check-circle';
                                        resultMessage = t('oauth.codex.importSuccess', { count: data.successCount });
                                    } else if (isAllFailed) {
                                        resultClass = 'background: #fef2f2; border: 1px solid #fecaca; color: #991b1b;';
                                        resultIcon = 'fa-times-circle';
                                        resultMessage = t('oauth.codex.importAllFailed', { count: data.failedCount });
                                    } else {
                                        resultClass = 'background: #fffbeb; border: 1px solid #fde68a; color: #92400e;';
                                        resultIcon = 'fa-exclamation-triangle';
                                        resultMessage = t('oauth.codex.importPartial', { success: data.successCount, failed: data.failedCount });
                                    }
                                    
                                    resultDiv.style.cssText = `display: block; margin-top: 16px; padding: 12px; border-radius: 8px; ${resultClass}`;
                                    const headerDiv = resultDiv.querySelector('div:first-child');
                                    headerDiv.innerHTML = `<i class="fas ${resultIcon}"></i> <strong>${resultMessage}</strong>`;
                                    
                                    if (data.successCount > 0) {
                                        importSuccess = true;
                                        loadProviders();
                                        loadConfigList();
                                    }
                                } else if (eventType === 'error') {
                                    throw new Error(data.error);
                                }
                            } catch (parseError) {
                                console.warn('Failed to parse SSE data:', parseError);
                            }
                            eventType = '';
                            eventData = '';
                        }
                    }
                }
            }
        } catch (error) {
            console.error('[Codex Batch Import] Failed:', error);
            progressDiv.style.display = 'none';
            resultDiv.style.cssText = 'display: block; margin-top: 16px; padding: 12px; border-radius: 8px; background: #fef2f2; border: 1px solid #fecaca; color: #991b1b;';
            resultDiv.innerHTML = `
                <div style="display: flex; align-items: center; gap: 8px;">
                    <i class="fas fa-times-circle"></i>
                    <strong>${t('oauth.codex.importError')}: ${error.message}</strong>
                </div>
            `;
        } finally {
            cancelBtn.disabled = false;
            
            if (!importSuccess) {
                textarea.disabled = false;
                submitBtn.disabled = false;
                submitBtn.innerHTML = `<i class="fas fa-upload"></i> <span data-i18n="oauth.codex.startImport">${t('oauth.codex.startImport')}</span>`;
            } else {
                submitBtn.innerHTML = `<i class="fas fa-check-circle"></i> <span>${t('common.success')}</span>`;
            }
        }
    });
}

/**
 * Show Kiro OAuth auth method selector dialog
 * @param {string} providerType - Provider type
 */
function showKiroAuthMethodSelector(providerType) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.display = 'flex';
    
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 550px;">
            <div class="modal-header">
                <h3><i class="fas fa-key"></i> <span data-i18n="oauth.kiro.selectMethod">${t('oauth.kiro.selectMethod')}</span></h3>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <div class="auth-method-options" style="display: flex; flex-direction: column; gap: 12px;">
                    <!-- <button class="auth-method-btn" data-method="google" style="display: flex; align-items: center; gap: 12px; padding: 16px; border: 2px solid #e0e0e0; border-radius: 8px; background: white; cursor: pointer; transition: all 0.2s;">
                        <i class="fab fa-google" style="font-size: 24px; color: #4285f4;"></i>
                        <div style="text-align: left;">
                            <div style="font-weight: 600; color: #333;" data-i18n="oauth.kiro.google">${t('oauth.kiro.google')}</div>
                            <div style="font-size: 12px; color: #666;" data-i18n="oauth.kiro.googleDesc">${t('oauth.kiro.googleDesc')}</div>
                        </div>
                    </button>
                    <button class="auth-method-btn" data-method="github" style="display: flex; align-items: center; gap: 12px; padding: 16px; border: 2px solid #e0e0e0; border-radius: 8px; background: white; cursor: pointer; transition: all 0.2s;">
                        <i class="fab fa-github" style="font-size: 24px; color: #333;"></i>
                        <div style="text-align: left;">
                            <div style="font-weight: 600; color: #333;" data-i18n="oauth.kiro.github">${t('oauth.kiro.github')}</div>
                            <div style="font-size: 12px; color: #666;" data-i18n="oauth.kiro.githubDesc">${t('oauth.kiro.githubDesc')}</div>
                        </div>
                    </button> -->
                    <button class="auth-method-btn" data-method="builder-id" style="display: flex; align-items: center; gap: 12px; padding: 16px; border: 2px solid #e0e0e0; border-radius: 8px; background: white; cursor: pointer; transition: all 0.2s;">
                        <i class="fab fa-aws" style="font-size: 24px; color: #ff9900;"></i>
                        <div style="text-align: left;">
                            <div style="font-weight: 600; color: #333;" data-i18n="oauth.kiro.awsBuilder">${t('oauth.kiro.awsBuilder')}</div>
                            <div style="font-size: 12px; color: #666;" data-i18n="oauth.kiro.awsBuilderDesc">${t('oauth.kiro.awsBuilderDesc')}</div>
                        </div>
                    </button>
                    <button class="auth-method-btn" data-method="aws-import" style="display: flex; align-items: center; gap: 12px; padding: 16px; border: 2px solid #e0e0e0; border-radius: 8px; background: white; cursor: pointer; transition: all 0.2s;">
                        <i class="fas fa-cloud-upload-alt" style="font-size: 24px; color: #ff9900;"></i>
                        <div style="text-align: left;">
                            <div style="font-weight: 600; color: #333;" data-i18n="oauth.kiro.awsImport">${t('oauth.kiro.awsImport')}</div>
                            <div style="font-size: 12px; color: #666;" data-i18n="oauth.kiro.awsImportDesc">${t('oauth.kiro.awsImportDesc')}</div>
                        </div>
                    </button>
                    <button class="auth-method-btn" data-method="batch-import" style="display: flex; align-items: center; gap: 12px; padding: 16px; border: 2px solid #e0e0e0; border-radius: 8px; background: white; cursor: pointer; transition: all 0.2s;">
                        <i class="fas fa-file-import" style="font-size: 24px; color: #10b981;"></i>
                        <div style="text-align: left;">
                            <div style="font-weight: 600; color: #333;" data-i18n="oauth.kiro.batchImport">${t('oauth.kiro.batchImport')}</div>
                            <div style="font-size: 12px; color: #666;" data-i18n="oauth.kiro.batchImportDesc">${t('oauth.kiro.batchImportDesc')}</div>
                        </div>
                    </button>
                </div>
            </div>
            <div class="modal-footer">
                <button class="modal-cancel" data-i18n="modal.provider.cancel">${t('modal.provider.cancel')}</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Close button event
    const closeBtn = modal.querySelector('.modal-close');
    const cancelBtn = modal.querySelector('.modal-cancel');
    [closeBtn, cancelBtn].forEach(btn => {
        btn.addEventListener('click', () => {
            modal.remove();
        });
    });
    
    // Auth method selection button events
    const methodBtns = modal.querySelectorAll('.auth-method-btn');
    methodBtns.forEach(btn => {
        btn.addEventListener('mouseenter', () => {
            btn.style.borderColor = '#00a67e';
            btn.style.background = '#f8fffe';
        });
        btn.addEventListener('mouseleave', () => {
            btn.style.borderColor = '#e0e0e0';
            btn.style.background = 'white';
        });
        btn.addEventListener('click', async () => {
            const method = btn.dataset.method;
            modal.remove();
            
            if (method === 'batch-import') {
                showKiroBatchImportModal();
            } else if (method === 'aws-import') {
                showKiroAwsImportModal();
            } else {
                await executeGenerateAuthUrl(providerType, { method });
            }
        });
    });
}

/**
 * Show Gemini OAuth auth method selector dialog
 * @param {string} providerType - Provider type
 */
function showGeminiAuthMethodSelector(providerType) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.display = 'flex';
    
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 500px;">
            <div class="modal-header">
                <h3><i class="fas fa-key"></i> <span data-i18n="oauth.gemini.selectMethod">${t('oauth.gemini.selectMethod')}</span></h3>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <div class="auth-method-options" style="display: flex; flex-direction: column; gap: 12px;">
                    <button class="auth-method-btn" data-method="oauth" style="display: flex; align-items: center; gap: 12px; padding: 16px; border: 2px solid #e0e0e0; border-radius: 8px; background: white; cursor: pointer; transition: all 0.2s;">
                        <i class="fab fa-google" style="font-size: 24px; color: #4285f4;"></i>
                        <div style="text-align: left;">
                            <div style="font-weight: 600; color: #333;" data-i18n="oauth.gemini.oauth">${t('oauth.gemini.oauth')}</div>
                            <div style="font-size: 12px; color: #666;" data-i18n="oauth.gemini.oauthDesc">${t('oauth.gemini.oauthDesc')}</div>
                        </div>
                    </button>
                    <button class="auth-method-btn" data-method="batch-import" style="display: flex; align-items: center; gap: 12px; padding: 16px; border: 2px solid #e0e0e0; border-radius: 8px; background: white; cursor: pointer; transition: all 0.2s;">
                        <i class="fas fa-file-import" style="font-size: 24px; color: #10b981;"></i>
                        <div style="text-align: left;">
                            <div style="font-weight: 600; color: #333;" data-i18n="oauth.gemini.batchImport">${t('oauth.gemini.batchImport')}</div>
                            <div style="font-size: 12px; color: #666;" data-i18n="oauth.gemini.batchImportDesc">${t('oauth.gemini.batchImportDesc')}</div>
                        </div>
                    </button>
                </div>
            </div>
            <div class="modal-footer">
                <button class="modal-cancel" data-i18n="modal.provider.cancel">${t('modal.provider.cancel')}</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Close button event
    const closeBtn = modal.querySelector('.modal-close');
    const cancelBtn = modal.querySelector('.modal-cancel');
    [closeBtn, cancelBtn].forEach(btn => {
        btn.addEventListener('click', () => {
            modal.remove();
        });
    });
    
    // Auth method selection button events
    const methodBtns = modal.querySelectorAll('.auth-method-btn');
    methodBtns.forEach(btn => {
        btn.addEventListener('mouseenter', () => {
            btn.style.borderColor = '#4285f4';
            btn.style.background = '#f8faff';
        });
        btn.addEventListener('mouseleave', () => {
            btn.style.borderColor = '#e0e0e0';
            btn.style.background = 'white';
        });
        btn.addEventListener('click', async () => {
            const method = btn.dataset.method;
            modal.remove();
            
            if (method === 'batch-import') {
                showGeminiBatchImportModal(providerType);
            } else {
                await executeGenerateAuthUrl(providerType, {});
            }
        });
    });
}

/**
 * Show Gemini batch import modal
 * @param {string} providerType - Provider type
 */
function showGeminiBatchImportModal(providerType) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.display = 'flex';
    
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 600px;">
            <div class="modal-header">
                <h3><i class="fas fa-file-import"></i> <span data-i18n="oauth.gemini.batchImport">${t('oauth.gemini.batchImport')}</span> (${providerType})</h3>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <div class="batch-import-instructions" style="margin-bottom: 16px; padding: 12px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px;">
                    <p style="margin: 0; font-size: 14px; color: #1e40af;">
                        <i class="fas fa-info-circle"></i>
                        <span data-i18n="oauth.gemini.importInstructions">${t('oauth.gemini.importInstructions')}</span>
                    </p>
                </div>
                <div class="form-group">
                    <label for="batchGeminiTokens" style="display: block; margin-bottom: 8px; font-weight: 600; color: #374151;">
                        <span data-i18n="oauth.gemini.tokensLabel">${t('oauth.gemini.tokensLabel')}</span>
                    </label>
                    <textarea 
                        id="batchGeminiTokens" 
                        rows="10" 
                        style="width: 100%; padding: 12px; border: 1px solid #d1d5db; border-radius: 8px; font-family: monospace; font-size: 13px; resize: vertical;"
                        placeholder='${t('oauth.gemini.tokensPlaceholder')}'
                        data-i18n-placeholder="oauth.gemini.tokensPlaceholder"
                    ></textarea>
                </div>
                <div class="form-group" style="margin-top: 12px; margin-bottom: 16px;">
                    <details style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px;">
                        <summary style="padding: 12px; cursor: pointer; font-weight: 600; color: #374151; user-select: none;">
                            <i class="fas fa-code" style="color: #4285f4; margin-right: 8px;"></i>
                            <span data-i18n="oauth.gemini.jsonExample">${t('oauth.gemini.jsonExample')}</span>
                        </summary>
                        <div style="padding: 12px; background: #1f2937; border-radius: 0 0 8px 8px;">
                            <div style="color: #10b981; font-family: monospace; font-size: 12px;">
                                <div style="color: #9ca3af; margin-bottom: 8px;">// Single credential import example:</div>
                                <pre style="margin: 0; white-space: pre; overflow-x: auto;">{
  "access_token": "ya29.a0A...",
  "refresh_token": "1//0...",
  "scope": "https://www.googleapis.com/auth/cloud-platform",
  "token_type": "Bearer",
  "expiry_date": 1738590000000
}</pre>
                            </div>
                            <div style="color: #10b981; font-family: monospace; font-size: 12px; margin-top: 16px;">
                                <div style="color: #9ca3af; margin-bottom: 8px;">// Batch import example (JSON array):</div>
                                <pre style="margin: 0; white-space: pre; overflow-x: auto;">[
  {
    "access_token": "ya29.a0A1...",
    "refresh_token": "1//0..."
  },
  {
    "access_token": "ya29.a0A2...",
    "refresh_token": "1//0..."
  }
]</pre>
                            </div>
                        </div>
                    </details>
                </div>
                <div class="batch-import-stats" id="geminiBatchStats" style="display: none; margin-top: 12px; padding: 12px; background: #f3f4f6; border-radius: 8px;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span data-i18n="oauth.gemini.tokenCount">${t('oauth.gemini.tokenCount')}</span>
                        <span id="geminiTokenCountValue" style="font-weight: 600;">0</span>
                    </div>
                </div>
                <div class="batch-import-progress" id="geminiBatchProgress" style="display: none; margin-top: 16px;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <i class="fas fa-spinner fa-spin" style="color: #4285f4;"></i>
                        <span data-i18n="oauth.gemini.importing">${t('oauth.gemini.importing')}</span>
                    </div>
                    <div class="progress-bar" style="margin-top: 8px; height: 8px; background: #e5e7eb; border-radius: 4px; overflow: hidden;">
                        <div id="geminiImportProgressBar" style="height: 100%; width: 0%; background: #4285f4; transition: width 0.3s;"></div>
                    </div>
                </div>
                <div class="batch-import-result" id="geminiBatchResult" style="display: none; margin-top: 16px; padding: 12px; border-radius: 8px;"></div>
            </div>
            <div class="modal-footer">
                <button class="modal-cancel" data-i18n="modal.provider.cancel">${t('modal.provider.cancel')}</button>
                <button class="btn btn-primary batch-import-submit" id="geminiBatchSubmit">
                    <i class="fas fa-upload"></i>
                    <span data-i18n="oauth.gemini.startImport">${t('oauth.gemini.startImport')}</span>
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    const textarea = modal.querySelector('#batchGeminiTokens');
    const statsDiv = modal.querySelector('#geminiBatchStats');
    const tokenCountValue = modal.querySelector('#geminiTokenCountValue');
    const progressDiv = modal.querySelector('#geminiBatchProgress');
    const progressBar = modal.querySelector('#geminiImportProgressBar');
    const resultDiv = modal.querySelector('#geminiBatchResult');
    const submitBtn = modal.querySelector('#geminiBatchSubmit');
    const closeBtn = modal.querySelector('.modal-close');
    const cancelBtn = modal.querySelector('.modal-cancel');
    
    // Real-time token count
    textarea.addEventListener('input', () => {
        try {
            const val = textarea.value.trim();
            if (!val) {
                statsDiv.style.display = 'none';
                return;
            }
            const data = JSON.parse(val);
            const tokens = Array.isArray(data) ? data : [data];
            statsDiv.style.display = 'block';
            tokenCountValue.textContent = tokens.length;
        } catch (e) {
            statsDiv.style.display = 'none';
        }
    });
    
    // Close button event
    [closeBtn, cancelBtn].forEach(btn => {
        btn.addEventListener('click', () => {
            modal.remove();
        });
    });
    
    // Submit button event
    submitBtn.addEventListener('click', async () => {
        let tokens = [];
        try {
            const val = textarea.value.trim();
            const data = JSON.parse(val);
            tokens = Array.isArray(data) ? data : [data];
        } catch (e) {
            showToast(t('common.error'), t('oauth.gemini.noTokens'), 'error');
            return;
        }
        
        if (tokens.length === 0) {
            showToast(t('common.warning'), t('oauth.gemini.noTokens'), 'warning');
            return;
        }
        
        // Disable input and buttons
        textarea.disabled = true;
        submitBtn.disabled = true;
        cancelBtn.disabled = true;
        progressDiv.style.display = 'block';
        resultDiv.style.display = 'none';
        progressBar.style.width = '0%';
        
        // Create real-time result display area
        resultDiv.style.cssText = 'display: block; margin-top: 16px; padding: 12px; border-radius: 8px; background: #f3f4f6; border: 1px solid #d1d5db;';
        resultDiv.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                <i class="fas fa-spinner fa-spin" style="color: #4285f4;"></i>
                <strong id="geminiBatchProgressText">${t('oauth.gemini.importingProgress', { current: 0, total: tokens.length })}</strong>
            </div>
            <div id="geminiBatchResultsList" style="max-height: 200px; overflow-y: auto; font-size: 12px; margin-top: 8px;"></div>
        `;
        
        const progressText = resultDiv.querySelector('#geminiBatchProgressText');
        const resultsList = resultDiv.querySelector('#geminiBatchResultsList');
        
        let importSuccess = false; // Track whether import succeeded

        try {
            const response = await fetch('/api/gemini/batch-import-tokens', {
                method: 'POST',
                headers: window.apiClient ? window.apiClient.getAuthHeaders() : {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ providerType, tokens })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                
                let eventType = '';
                let eventData = '';
                
                for (const line of lines) {
                    if (line.startsWith('event: ')) {
                        eventType = line.substring(7).trim();
                    } else if (line.startsWith('data: ')) {
                        eventData = line.substring(6).trim();
                        
                        if (eventType && eventData) {
                            try {
                                const data = JSON.parse(eventData);
                                
                                if (eventType === 'progress') {
                                    const { index, total, current } = data;
                                    const percentage = Math.round((index / total) * 100);
                                    progressBar.style.width = `${percentage}%`;
                                    progressText.textContent = t('oauth.gemini.importingProgress', { current: index, total: total });
                                    
                                    const resultItem = document.createElement('div');
                                    resultItem.style.cssText = 'padding: 4px 0; border-bottom: 1px solid rgba(0,0,0,0.1);';
                                    if (current.success) {
                                        resultItem.innerHTML = `Token ${current.index}: <span style="color: #166534;">✓ ${current.path}</span>`;
                                    } else if (current.error === 'duplicate') {
                                        resultItem.innerHTML = `Token ${current.index}: <span style="color: #d97706;">⚠ ${t('oauth.kiro.duplicateToken')}</span>
                                            ${current.existingPath ? `<span style="color: #666; font-size: 11px;">(${current.existingPath})</span>` : ''}`;
                                    } else {
                                        resultItem.innerHTML = `Token ${current.index}: <span style="color: #991b1b;">✗ ${current.error}</span>`;
                                    }
                                    resultsList.appendChild(resultItem);
                                    resultsList.scrollTop = resultsList.scrollHeight;
                                } else if (eventType === 'complete') {
                                    progressBar.style.width = '100%';
                                    progressDiv.style.display = 'none';
                                    
                                    const isAllSuccess = data.failedCount === 0;
                                    const isAllFailed = data.successCount === 0;
                                    let resultClass, resultIcon, resultMessage;
                                    
                                    if (isAllSuccess) {
                                        resultClass = 'background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534;';
                                        resultIcon = 'fa-check-circle';
                                        resultMessage = t('oauth.gemini.importSuccess', { count: data.successCount });
                                    } else if (isAllFailed) {
                                        resultClass = 'background: #fef2f2; border: 1px solid #fecaca; color: #991b1b;';
                                        resultIcon = 'fa-times-circle';
                                        resultMessage = t('oauth.gemini.importAllFailed', { count: data.failedCount });
                                    } else {
                                        resultClass = 'background: #fffbeb; border: 1px solid #fde68a; color: #92400e;';
                                        resultIcon = 'fa-exclamation-triangle';
                                        resultMessage = t('oauth.gemini.importPartial', { success: data.successCount, failed: data.failedCount });
                                    }
                                    
                                    resultDiv.style.cssText = `display: block; margin-top: 16px; padding: 12px; border-radius: 8px; ${resultClass}`;
                                    const headerDiv = resultDiv.querySelector('div:first-child');
                                    headerDiv.innerHTML = `<i class="fas ${resultIcon}"></i> <strong>${resultMessage}</strong>`;
                                    
                                    if (data.successCount > 0) {
                                        importSuccess = true;
                                        loadProviders();
                                        loadConfigList();
                                    }
                                } else if (eventType === 'error') {
                                    throw new Error(data.error);
                                }
                            } catch (parseError) {
                                console.warn('Failed to parse SSE data:', parseError);
                            }
                            eventType = '';
                            eventData = '';
                        }
                    }
                }
            }
        } catch (error) {
            console.error('[Gemini Batch Import] Failed:', error);
            progressDiv.style.display = 'none';
            resultDiv.style.cssText = 'display: block; margin-top: 16px; padding: 12px; border-radius: 8px; background: #fef2f2; border: 1px solid #fecaca; color: #991b1b;';
            resultDiv.innerHTML = `
                <div style="display: flex; align-items: center; gap: 8px;">
                    <i class="fas fa-times-circle"></i>
                    <strong>${t('oauth.gemini.importError')}: ${error.message}</strong>
                </div>
            `;
        } finally {
            cancelBtn.disabled = false;
            
            if (!importSuccess) {
                textarea.disabled = false;
                submitBtn.disabled = false;
                submitBtn.innerHTML = `<i class="fas fa-upload"></i> <span data-i18n="oauth.gemini.startImport">${t('oauth.gemini.startImport')}</span>`;
            } else {
                submitBtn.innerHTML = `<i class="fas fa-check-circle"></i> <span>${t('common.success')}</span>`;
            }
        }
    });
}

/**
 * Show Kiro batch import refreshToken modal
 */
function showKiroBatchImportModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.display = 'flex';
    
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 600px;">
            <div class="modal-header">
                <h3><i class="fas fa-file-import"></i> <span data-i18n="oauth.kiro.batchImport">${t('oauth.kiro.batchImport')}</span></h3>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <div class="batch-import-instructions" style="margin-bottom: 16px; padding: 12px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px;">
                    <p style="margin: 0; font-size: 14px; color: #166534;">
                        <i class="fas fa-info-circle"></i>
                        <span data-i18n="oauth.kiro.batchImportInstructions">${t('oauth.kiro.batchImportInstructions')}</span>
                    </p>
                </div>
                <div class="form-group">
                    <label for="batchRefreshTokens" style="display: block; margin-bottom: 8px; font-weight: 600; color: #374151;">
                        <span data-i18n="oauth.kiro.refreshTokensLabel">${t('oauth.kiro.refreshTokensLabel')}</span>
                    </label>
                    <textarea 
                        id="batchRefreshTokens" 
                        rows="10" 
                        style="width: 100%; padding: 12px; border: 1px solid #d1d5db; border-radius: 8px; font-family: monospace; font-size: 13px; resize: vertical;"
                        placeholder="${t('oauth.kiro.refreshTokensPlaceholder')}"
                        data-i18n-placeholder="oauth.kiro.refreshTokensPlaceholder"
                    ></textarea>
                </div>
                <div class="batch-import-stats" id="batchImportStats" style="display: none; margin-top: 12px; padding: 12px; background: #f3f4f6; border-radius: 8px;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span data-i18n="oauth.kiro.tokenCount">${t('oauth.kiro.tokenCount')}</span>
                        <span id="tokenCountValue" style="font-weight: 600;">0</span>
                    </div>
                </div>
                <div class="batch-import-progress" id="batchImportProgress" style="display: none; margin-top: 16px;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <i class="fas fa-spinner fa-spin" style="color: #10b981;"></i>
                        <span data-i18n="oauth.kiro.importing">${t('oauth.kiro.importing')}</span>
                    </div>
                    <div class="progress-bar" style="margin-top: 8px; height: 8px; background: #e5e7eb; border-radius: 4px; overflow: hidden;">
                        <div id="importProgressBar" style="height: 100%; width: 0%; background: #10b981; transition: width 0.3s;"></div>
                    </div>
                </div>
                <div class="batch-import-result" id="batchImportResult" style="display: none; margin-top: 16px; padding: 12px; border-radius: 8px;"></div>
            </div>
            <div class="modal-footer">
                <button class="modal-cancel" data-i18n="modal.provider.cancel">${t('modal.provider.cancel')}</button>
                <button class="btn btn-primary batch-import-submit" id="batchImportSubmit">
                    <i class="fas fa-upload"></i>
                    <span data-i18n="oauth.kiro.startImport">${t('oauth.kiro.startImport')}</span>
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    const textarea = modal.querySelector('#batchRefreshTokens');
    const statsDiv = modal.querySelector('#batchImportStats');
    const tokenCountValue = modal.querySelector('#tokenCountValue');
    const progressDiv = modal.querySelector('#batchImportProgress');
    const progressBar = modal.querySelector('#importProgressBar');
    const resultDiv = modal.querySelector('#batchImportResult');
    const submitBtn = modal.querySelector('#batchImportSubmit');
    const closeBtn = modal.querySelector('.modal-close');
    const cancelBtn = modal.querySelector('.modal-cancel');
    
    // Real-time token count
    textarea.addEventListener('input', () => {
        const tokens = textarea.value.split('\n').filter(line => line.trim());
        if (tokens.length > 0) {
            statsDiv.style.display = 'block';
            tokenCountValue.textContent = tokens.length;
        } else {
            statsDiv.style.display = 'none';
        }
    });
    
    // Close button event
    [closeBtn, cancelBtn].forEach(btn => {
        btn.addEventListener('click', () => {
            modal.remove();
        });
    });
    
    // Submit button event - use SSE streaming response for real-time progress
    submitBtn.addEventListener('click', async () => {
        const tokens = textarea.value.split('\n').filter(line => line.trim());
        
        if (tokens.length === 0) {
            showToast(t('common.warning'), t('oauth.kiro.noTokens'), 'warning');
            return;
        }
        
        // Disable input and buttons
        textarea.disabled = true;
        submitBtn.disabled = true;
        cancelBtn.disabled = true;
        progressDiv.style.display = 'block';
        resultDiv.style.display = 'none';
        progressBar.style.width = '0%';
        
        // Create real-time result display area
        resultDiv.style.cssText = 'display: block; margin-top: 16px; padding: 12px; border-radius: 8px; background: #f3f4f6; border: 1px solid #d1d5db;';
        resultDiv.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                <i class="fas fa-spinner fa-spin" style="color: #10b981;"></i>
                <strong id="batchProgressText">${t('oauth.kiro.importingProgress', { current: 0, total: tokens.length })}</strong>
            </div>
            <div id="batchResultsList" style="max-height: 200px; overflow-y: auto; font-size: 12px; margin-top: 8px;"></div>
        `;
        
        const progressText = resultDiv.querySelector('#batchProgressText');
        const resultsList = resultDiv.querySelector('#batchResultsList');
        
        let successCount = 0;
        let failedCount = 0;
        const details = [];
        let importSuccess = false; // Track whether import succeeded
        
        try {
            // Use fetch + SSE for streaming response (with auth headers)
            const response = await fetch('/api/kiro/batch-import-tokens', {
                method: 'POST',
                headers: window.apiClient ? window.apiClient.getAuthHeaders() : {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ refreshTokens: tokens })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                buffer += decoder.decode(value, { stream: true });
                
                // Parse SSE events
                const lines = buffer.split('\n');
                buffer = lines.pop() || ''; // Keep the potentially incomplete last line
                
                let eventType = '';
                let eventData = '';
                
                for (const line of lines) {
                    if (line.startsWith('event: ')) {
                        eventType = line.substring(7).trim();
                    } else if (line.startsWith('data: ')) {
                        eventData = line.substring(6).trim();
                        
                        if (eventType && eventData) {
                            try {
                                const data = JSON.parse(eventData);
                                
                                if (eventType === 'start') {
                                    // Start event
                                    console.log(`[Batch Import] Starting import of ${data.total} tokens`);
                                } else if (eventType === 'progress') {
                                    // Progress update
                                    const { index, total, current, successCount: sc, failedCount: fc } = data;
                                    successCount = sc;
                                    failedCount = fc;
                                    details.push(current);
                                    
                                    // Update progress bar
                                    const percentage = Math.round((index / total) * 100);
                                    progressBar.style.width = `${percentage}%`;
                                    
                                    // Update progress text
                                    progressText.textContent = t('oauth.kiro.importingProgress', { current: index, total: total });
                                    
                                    // Add result item
                                    const resultItem = document.createElement('div');
                                    resultItem.style.cssText = 'padding: 4px 0; border-bottom: 1px solid rgba(0,0,0,0.1);';
                                    
                                    if (current.success) {
                                        resultItem.innerHTML = `Token ${current.index}: <span style="color: #166534;">✓ ${current.path}</span>`;
                                    } else if (current.error === 'duplicate') {
                                        resultItem.innerHTML = `Token ${current.index}: <span style="color: #d97706;">⚠ ${t('oauth.kiro.duplicateToken')}</span>
                                            ${current.existingPath ? `<span style="color: #666; font-size: 11px;">(${current.existingPath})</span>` : ''}`;
                                    } else {
                                        resultItem.innerHTML = `Token ${current.index}: <span style="color: #991b1b;">✗ ${current.error}</span>`;
                                    }
                                    
                                    resultsList.appendChild(resultItem);
                                    // Auto-scroll to bottom
                                    resultsList.scrollTop = resultsList.scrollHeight;
                                    
                                } else if (eventType === 'complete') {
                                    // Complete event
                                    progressBar.style.width = '100%';
                                    progressDiv.style.display = 'none';
                                    
                                    const isAllSuccess = data.failedCount === 0;
                                    const isAllFailed = data.successCount === 0;
                                    
                                    let resultClass, resultIcon, resultMessage;
                                    if (isAllSuccess) {
                                        resultClass = 'background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534;';
                                        resultIcon = 'fa-check-circle';
                                        resultMessage = t('oauth.kiro.importSuccess', { count: data.successCount });
                                    } else if (isAllFailed) {
                                        resultClass = 'background: #fef2f2; border: 1px solid #fecaca; color: #991b1b;';
                                        resultIcon = 'fa-times-circle';
                                        resultMessage = t('oauth.kiro.importAllFailed', { count: data.failedCount });
                                    } else {
                                        resultClass = 'background: #fffbeb; border: 1px solid #fde68a; color: #92400e;';
                                        resultIcon = 'fa-exclamation-triangle';
                                        resultMessage = t('oauth.kiro.importPartial', { success: data.successCount, failed: data.failedCount });
                                    }
                                    
                                    // Update result area style
                                    resultDiv.style.cssText = `display: block; margin-top: 16px; padding: 12px; border-radius: 8px; ${resultClass}`;
                                    
                                    // Update header
                                    const headerDiv = resultDiv.querySelector('div:first-child');
                                    headerDiv.innerHTML = `<i class="fas ${resultIcon}"></i> <strong>${resultMessage}</strong>`;
                                    
                                    // If any succeeded, refresh provider list
                                    if (data.successCount > 0) {
                                        importSuccess = true;
                                        loadProviders();
                                        loadConfigList();
                                    }
                                    
                                } else if (eventType === 'error') {
                                    throw new Error(data.error);
                                }
                            } catch (parseError) {
                                console.warn('Failed to parse SSE data:', parseError);
                            }
                            
                            eventType = '';
                            eventData = '';
                        }
                    }
                }
            }
            
        } catch (error) {
            console.error('[Kiro Batch Import] Failed:', error);
            progressDiv.style.display = 'none';
            resultDiv.style.cssText = 'display: block; margin-top: 16px; padding: 12px; border-radius: 8px; background: #fef2f2; border: 1px solid #fecaca; color: #991b1b;';
            resultDiv.innerHTML = `
                <div style="display: flex; align-items: center; gap: 8px;">
                    <i class="fas fa-times-circle"></i>
                    <strong>${t('oauth.kiro.importError')}: ${error.message}</strong>
                </div>
            `;
        } finally {
            // Re-enable buttons
            cancelBtn.disabled = false;
            if (!importSuccess) {
                textarea.disabled = false;
                submitBtn.disabled = false;
                submitBtn.innerHTML = `<i class="fas fa-upload"></i> <span data-i18n="oauth.kiro.startImport">${t('oauth.kiro.startImport')}</span>`;
            } else {
                submitBtn.innerHTML = `<i class="fas fa-check-circle"></i> <span>${t('common.success')}</span>`;
            }
        }
    });
}

/**
 * Show Kiro AWS account import modal
 * Supports importing credential files from AWS SSO cache directory, or pasting JSON directly
 */
function showKiroAwsImportModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.display = 'flex';
    
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 700px;">
            <div class="modal-header">
                <h3><i class="fas fa-cloud-upload-alt" style="color: #ff9900;"></i> <span data-i18n="oauth.kiro.awsImport">${t('oauth.kiro.awsImport')}</span></h3>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <div class="aws-import-instructions" style="margin-bottom: 16px; padding: 12px; background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px;">
                    <p style="margin: 0; font-size: 14px; color: #9a3412;">
                        <i class="fas fa-info-circle"></i>
                        <span data-i18n="oauth.kiro.awsImportInstructions">${t('oauth.kiro.awsImportInstructions')}</span>
                    </p>
                    <p style="margin: 8px 0 0 0; font-size: 12px; color: #c2410c;">
                        <i class="fas fa-folder-open"></i>
                        <code style="background: #fed7aa; padding: 2px 6px; border-radius: 4px;">C:\\Users\\{username}\\.aws\\sso\\cache</code>
                    </p>
                </div>
                
                <!-- Input mode toggle -->
                <div class="input-mode-toggle" style="display: flex; gap: 8px; margin-bottom: 16px;">
                    <button class="mode-btn active" data-mode="file" style="flex: 1; padding: 10px 16px; border: 2px solid #ff9900; border-radius: 8px; background: #fff7ed; color: #9a3412; font-weight: 600; cursor: pointer; transition: all 0.2s;">
                        <i class="fas fa-file-upload"></i>
                        <span data-i18n="oauth.kiro.awsModeFile">${t('oauth.kiro.awsModeFile')}</span>
                    </button>
                    <button class="mode-btn" data-mode="json" style="flex: 1; padding: 10px 16px; border: 2px solid #d1d5db; border-radius: 8px; background: white; color: #6b7280; font-weight: 600; cursor: pointer; transition: all 0.2s;">
                        <i class="fas fa-code"></i>
                        <span data-i18n="oauth.kiro.awsModeJson">${t('oauth.kiro.awsModeJson')}</span>
                    </button>
                </div>
                
                <!-- File upload mode -->
                <div class="file-mode-section" id="fileModeSection">
                    <div class="form-group" style="margin-bottom: 16px;">
                        <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #374151;">
                            <span data-i18n="oauth.kiro.awsUploadFiles">${t('oauth.kiro.awsUploadFiles')}</span>
                        </label>
                        <div class="aws-file-upload-area" style="border: 2px dashed #d1d5db; border-radius: 8px; padding: 24px; text-align: center; cursor: pointer; transition: all 0.2s;">
                            <input type="file" id="awsFilesInput" multiple accept=".json" style="display: none;">
                            <i class="fas fa-cloud-upload-alt" style="font-size: 36px; color: #9ca3af; margin-bottom: 8px;"></i>
                            <p style="margin: 0; color: #6b7280;" data-i18n="oauth.kiro.awsDragDrop">${t('oauth.kiro.awsDragDrop')}</p>
                            <p style="margin: 4px 0 0 0; font-size: 12px; color: #9ca3af;" data-i18n="oauth.kiro.awsClickUpload">${t('oauth.kiro.awsClickUpload')}</p>
                        </div>
                        <p style="margin: 8px 0 0 0; font-size: 12px; color: #6b7280;">
                            <i class="fas fa-lightbulb" style="color: #f59e0b;"></i>
                            <span data-i18n="oauth.kiro.awsFileHint">${t('oauth.kiro.awsFileHint')}</span>
                        </p>
                    </div>
                    
                    <div class="aws-files-list" id="awsFilesList" style="display: none; margin-bottom: 16px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                            <label style="font-weight: 600; color: #374151;" data-i18n="oauth.kiro.awsSelectedFiles">${t('oauth.kiro.awsSelectedFiles')}</label>
                            <button id="clearFilesBtn" style="background: none; border: none; color: #ef4444; cursor: pointer; font-size: 12px; padding: 4px 8px; border-radius: 4px; transition: all 0.2s;">
                                <i class="fas fa-trash-alt"></i>
                                <span data-i18n="oauth.kiro.awsClearFiles">${t('oauth.kiro.awsClearFiles')}</span>
                            </button>
                        </div>
                        <div id="awsFilesContainer" style="background: #f9fafb; border-radius: 8px; padding: 12px;"></div>
                    </div>
                </div>
                
                <!-- JSON input mode -->
                <div class="json-mode-section" id="jsonModeSection" style="display: none;">
                    <div class="form-group" style="margin-bottom: 16px;">
                        <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #374151;">
                            <span data-i18n="oauth.kiro.awsJsonInput">${t('oauth.kiro.awsJsonInput')}</span>
                        </label>
                        <textarea 
                            id="awsJsonInput" 
                            rows="12" 
                            style="width: 100%; padding: 12px; border: 1px solid #d1d5db; border-radius: 8px; font-family: monospace; font-size: 13px; resize: vertical;"
                            placeholder="${t('oauth.kiro.awsJsonPlaceholderSimple')}"
                            data-i18n-placeholder="oauth.kiro.awsJsonPlaceholderSimple"
                        ></textarea>
                        <p style="margin: 8px 0 0 0; font-size: 12px; color: #6b7280;">
                            <i class="fas fa-lightbulb" style="color: #f59e0b;"></i>
                            <span data-i18n="oauth.kiro.awsJsonHint">${t('oauth.kiro.awsJsonHint')}</span>
                        </p>
                    </div>
                    <details style="margin-bottom: 16px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px;">
                        <summary style="padding: 12px; cursor: pointer; font-weight: 600; color: #374151; user-select: none;">
                            <i class="fas fa-code" style="color: #ff9900; margin-right: 8px;"></i>
                            <span data-i18n="oauth.kiro.awsJsonExample">${t('oauth.kiro.awsJsonExample')}</span>
                        </summary>
                        <div style="padding: 12px; background: #1f2937; border-radius: 0 0 8px 8px;">
                            <div style="color: #10b981; font-family: monospace; font-size: 12px; margin-bottom: 12px;">
                                <div style="color: #9ca3af; margin-bottom: 8px;">// Single credential import example:</div>
                                <pre style="margin: 0; white-space: pre; overflow-x: auto;">{
  "clientId": "VYZBSTx3Q7QEq1W3Wn8c5nVzLWVhc3QtMQ",
  "clientSecret": "eyJraWQi...OAMc",
  "expiresAt": "2026-01-09T04:43:18.079944400+00:00",
  "accessToken": "aoaAAAAAGlgghoSqRgQK...2tfhmdNZDA",
  "authMethod": "IdC",
  "provider": "BuilderId",
  "refreshToken": "aorAAAAAGn...uKw+E3",
  "region": "us-east-1"
}</pre>
                            </div>
                            <div style="color: #10b981; font-family: monospace; font-size: 12px; margin-top: 16px;">
                                <div style="color: #9ca3af; margin-bottom: 8px;">// Batch import example (JSON array):</div>
                                <pre style="margin: 0; white-space: pre; overflow-x: auto;">[
  {
    "clientId": "VYZBSTx3Q7QEq1W3Wn8c5nVzLWVhc3QtMQ",
    "clientSecret": "eyJraWQi...OAMc",
    "accessToken": "aoaAAAAAGlgghoSqRgQK...2tfhmdNZDA",
    "refreshToken": "aorAAAAAGn...uKw+E3",
    "region": "us-east-1"
  },
  {
    "clientId": "AnotherClientId123",
    "clientSecret": "eyJraWQi...xyz",
    "accessToken": "aoaAAAAAGlgghoSqRgQK...abc",
    "refreshToken": "aorAAAAAGn...def",
    "region": "us-west-2",
    "idcRegion": "us-west-2"
  }
]</pre>
                            </div>
                            <div style="color: #fbbf24; font-size: 11px; margin-top: 12px; padding: 8px; background: rgba(251, 191, 36, 0.1); border-radius: 4px;">
                                <i class="fas fa-info-circle"></i>
                                <strong>Note:</strong>AWS enterprise users need to add the <code style="background: rgba(0,0,0,0.3); padding: 2px 4px; border-radius: 2px;">idcRegion</code> field
                            </div>
                        </div>
                    </details>
                </div>
                
                <div class="aws-validation-result" id="awsValidationResult" style="display: none; margin-bottom: 16px; padding: 12px; border-radius: 8px;"></div>
                
                <div class="aws-json-preview" id="awsJsonPreview" style="display: none; margin-bottom: 16px;">
                    <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #374151;">
                        <i class="fas fa-eye"></i>
                        <span data-i18n="oauth.kiro.awsPreviewJson">${t('oauth.kiro.awsPreviewJson')}</span>
                    </label>
                    <pre id="awsJsonContent" style="background: #1f2937; color: #10b981; padding: 16px; border-radius: 8px; font-family: monospace; font-size: 12px; max-height: 200px; overflow: auto; white-space: pre-wrap; word-break: break-all;"></pre>
                </div>
            </div>
            <div class="modal-footer">
                <button class="modal-cancel" data-i18n="modal.provider.cancel">${t('modal.provider.cancel')}</button>
                <button class="btn btn-primary aws-import-submit" id="awsImportSubmit" disabled>
                    <i class="fas fa-check"></i>
                    <span data-i18n="oauth.kiro.awsConfirmImport">${t('oauth.kiro.awsConfirmImport')}</span>
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    const fileInput = modal.querySelector('#awsFilesInput');
    const uploadArea = modal.querySelector('.aws-file-upload-area');
    const filesListDiv = modal.querySelector('#awsFilesList');
    const filesContainer = modal.querySelector('#awsFilesContainer');
    const clearFilesBtn = modal.querySelector('#clearFilesBtn');
    const validationResult = modal.querySelector('#awsValidationResult');
    const jsonPreview = modal.querySelector('#awsJsonPreview');
    const jsonContent = modal.querySelector('#awsJsonContent');
    const submitBtn = modal.querySelector('#awsImportSubmit');
    const closeBtn = modal.querySelector('.modal-close');
    const cancelBtn = modal.querySelector('.modal-cancel');
    const modeBtns = modal.querySelectorAll('.mode-btn');
    const fileModeSection = modal.querySelector('#fileModeSection');
    const jsonModeSection = modal.querySelector('#jsonModeSection');
    const jsonInputTextarea = modal.querySelector('#awsJsonInput');
    
    let uploadedFiles = [];
    let mergedCredentials = null;
    let currentMode = 'file';
    
    // Clear files button event
    clearFilesBtn.addEventListener('click', () => {
        uploadedFiles = [];
        filesContainer.innerHTML = '';
        filesListDiv.style.display = 'none';
        validationResult.style.display = 'none';
        jsonPreview.style.display = 'none';
        submitBtn.disabled = true;
        mergedCredentials = null;
        // Clear file input
        fileInput.value = '';
    });
    
    // Clear button hover effect
    clearFilesBtn.addEventListener('mouseenter', () => {
        clearFilesBtn.style.background = '#fef2f2';
    });
    clearFilesBtn.addEventListener('mouseleave', () => {
        clearFilesBtn.style.background = 'none';
    });
    
    // Mode switch
    modeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const mode = btn.dataset.mode;
            if (mode === currentMode) return;
            
            currentMode = mode;
            
            // Update button styles
            modeBtns.forEach(b => {
                if (b.dataset.mode === mode) {
                    b.style.borderColor = '#ff9900';
                    b.style.background = '#fff7ed';
                    b.style.color = '#9a3412';
                    b.classList.add('active');
                } else {
                    b.style.borderColor = '#d1d5db';
                    b.style.background = 'white';
                    b.style.color = '#6b7280';
                    b.classList.remove('active');
                }
            });
            
            // Toggle display sections
            if (mode === 'file') {
                fileModeSection.style.display = 'block';
                jsonModeSection.style.display = 'none';
                // Re-validate file mode content
                validateAndPreview();
            } else {
                fileModeSection.style.display = 'none';
                jsonModeSection.style.display = 'block';
                // Validate JSON input
                validateJsonInput();
            }
        });
    });
    
    // JSON input real-time validation
    jsonInputTextarea.addEventListener('input', () => {
        validateJsonInput();
    });
    
    // Validate JSON input
    function validateJsonInput() {
        const inputValue = jsonInputTextarea.value.trim();
        
        if (!inputValue) {
            validationResult.style.display = 'none';
            jsonPreview.style.display = 'none';
            submitBtn.disabled = true;
            mergedCredentials = null;
            return;
        }
        
        try {
            mergedCredentials = JSON.parse(inputValue);
            validateAndShowResult();
        } catch (error) {
            validationResult.style.cssText = 'display: block; margin-bottom: 16px; padding: 12px; border-radius: 8px; background: #fef2f2; border: 1px solid #fecaca; color: #991b1b;';
            validationResult.innerHTML = `
                <div style="display: flex; align-items: center; gap: 8px;">
                    <i class="fas fa-exclamation-triangle"></i>
                    <strong data-i18n="oauth.kiro.awsJsonParseError">${t('oauth.kiro.awsJsonParseError')}</strong>
                </div>
                <p style="margin: 8px 0 0 0; font-size: 12px;">${error.message}</p>
            `;
            jsonPreview.style.display = 'none';
            submitBtn.disabled = true;
            mergedCredentials = null;
        }
    }
    
    // File upload area interaction
    uploadArea.addEventListener('click', () => fileInput.click());
    
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = '#ff9900';
        uploadArea.style.background = '#fffbeb';
    });
    
    uploadArea.addEventListener('dragleave', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = '#d1d5db';
        uploadArea.style.background = 'transparent';
    });
    
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = '#d1d5db';
        uploadArea.style.background = 'transparent';
        
        const files = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.json'));
        if (files.length > 0) {
            processFiles(files);
        }
    });
    
    fileInput.addEventListener('change', () => {
        const files = Array.from(fileInput.files);
        if (files.length > 0) {
            processFiles(files);
        }
    });
    
    // Process uploaded files (supports appending)
    async function processFiles(files) {
        for (const file of files) {
            // Check if a file with the same name already exists
            const existingIndex = uploadedFiles.findIndex(f => f.name === file.name);
            
            try {
                const content = await readFileAsText(file);
                const json = JSON.parse(content);
                
                if (existingIndex >= 0) {
                    // Replace existing file with same name
                    uploadedFiles[existingIndex] = {
                        name: file.name,
                        content: json
                    };
                    showToast(t('common.info'), t('oauth.kiro.awsFileReplaced', { filename: file.name }), 'info');
                } else {
                    // Append new file
                    uploadedFiles.push({
                        name: file.name,
                        content: json
                    });
                }
            } catch (error) {
                console.error(`Failed to parse ${file.name}:`, error);
                showToast(t('common.error'), t('oauth.kiro.awsParseError', { filename: file.name }), 'error');
            }
        }
        
        // Re-render file list
        renderFilesList();
        
        filesListDiv.style.display = uploadedFiles.length > 0 ? 'block' : 'none';
        
        // Clear file input so same file can be selected again
        fileInput.value = '';
        
        validateAndPreview();
    }
    
    // Render file list
    function renderFilesList() {
        filesContainer.innerHTML = '';
        
        for (const file of uploadedFiles) {
            const fileDiv = document.createElement('div');
            fileDiv.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 8px; background: white; border-radius: 4px; margin-bottom: 4px;';
            fileDiv.dataset.filename = file.name;
            
            const fields = Object.keys(file.content).slice(0, 5).join(', ');
            const moreFields = Object.keys(file.content).length > 5 ? '...' : '';
            
            fileDiv.innerHTML = `
                <div style="flex: 1; min-width: 0;">
                    <i class="fas fa-file-code" style="color: #ff9900; margin-right: 8px;"></i>
                    <span style="font-weight: 500;">${file.name}</span>
                    <div style="font-size: 11px; color: #6b7280; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${fields}${moreFields}</div>
                </div>
                <button class="remove-file-btn" data-filename="${file.name}" style="background: none; border: none; color: #ef4444; cursor: pointer; padding: 4px 8px; margin-left: 8px; flex-shrink: 0;">
                    <i class="fas fa-times"></i>
                </button>
            `;
            filesContainer.appendChild(fileDiv);
        }
        
        // Add delete file button event
        filesContainer.querySelectorAll('.remove-file-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const filename = e.currentTarget.dataset.filename;
                uploadedFiles = uploadedFiles.filter(f => f.name !== filename);
                renderFilesList();
                filesListDiv.style.display = uploadedFiles.length > 0 ? 'block' : 'none';
                validateAndPreview();
            });
        });
    }
    
    // Validate and preview (file mode)
    function validateAndPreview() {
        if (currentMode !== 'file') return;
        
        if (uploadedFiles.length === 0) {
            validationResult.style.display = 'none';
            jsonPreview.style.display = 'none';
            submitBtn.disabled = true;
            mergedCredentials = null;
            return;
        }
        
        // Intelligently merge all file contents
        // If multiple files have expiresAt, use the one from the file containing refreshToken
        mergedCredentials = {};
        let expiresAtFromRefreshTokenFile = null;
        
        for (const file of uploadedFiles) {
            // If this file contains refreshToken, record its expiresAt
            if (file.content.refreshToken && file.content.expiresAt) {
                expiresAtFromRefreshTokenFile = file.content.expiresAt;
            }
            Object.assign(mergedCredentials, file.content);
        }
        
        // If expiresAt from the file with refreshToken was found, use it
        if (expiresAtFromRefreshTokenFile) {
            mergedCredentials.expiresAt = expiresAtFromRefreshTokenFile;
        }
        
        validateAndShowResult();
    }
    
    // Validate and show result (common)
    function validateAndShowResult() {
        if (!mergedCredentials) {
            validationResult.style.display = 'none';
            jsonPreview.style.display = 'none';
            submitBtn.disabled = true;
            return;
        }
        
        // Check if batch import (array)
        const isBatchImport = Array.isArray(mergedCredentials);
        
        if (isBatchImport) {
            // Batch import mode: validate each object in the array
            let allValid = true;
            const credentialsValidation = mergedCredentials.map((cred, index) => {
                const hasClientId = !!cred.clientId;
                const hasClientSecret = !!cred.clientSecret;
                const hasAccessToken = !!cred.accessToken;
                const hasRefreshToken = !!cred.refreshToken;
                const isValid = hasClientId && hasClientSecret && hasAccessToken && hasRefreshToken;
                
                if (!isValid) allValid = false;
                
                return {
                    index: index + 1,
                    isValid,
                    fields: [
                        { key: 'clientId', has: hasClientId },
                        { key: 'clientSecret', has: hasClientSecret },
                        { key: 'accessToken', has: hasAccessToken },
                        { key: 'refreshToken', has: hasRefreshToken }
                    ]
                };
            });
            
            // Build batch validation result HTML
            const credentialsHtml = credentialsValidation.map(cv => {
                const statusIcon = cv.isValid ? '✓' : '✗';
                const statusColor = cv.isValid ? '#166534' : '#991b1b';
                const fieldsHtml = cv.fields.map(f => `
                    <span style="margin-right: 8px;">${f.key}: ${f.has
                        ? `<code style="background: #dcfce7; padding: 1px 4px; border-radius: 2px; color: #166534;">✓</code>`
                        : `<code style="background: #fecaca; padding: 1px 4px; border-radius: 2px; color: #991b1b;">✗</code>`
                    }</span>
                `).join('');
                
                return `
                    <div style="padding: 8px; margin-bottom: 4px; background: ${cv.isValid ? '#f0fdf4' : '#fef2f2'}; border: 1px solid ${cv.isValid ? '#bbf7d0' : '#fecaca'}; border-radius: 4px;">
                        <div style="font-weight: 600; color: ${statusColor}; margin-bottom: 4px;">
                            ${statusIcon} Credential ${cv.index}
                        </div>
                        <div style="font-size: 12px; color: #6b7280;">
                            ${fieldsHtml}
                        </div>
                    </div>
                `;
            }).join('');
            
            if (allValid) {
                validationResult.style.cssText = 'display: block; margin-bottom: 16px; padding: 12px; border-radius: 8px; background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534;';
                validationResult.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
                        <i class="fas fa-check-circle"></i>
                        <strong>Batch validation passed (${mergedCredentials.length} credentials)</strong>
                    </div>
                    <div style="max-height: 200px; overflow-y: auto;">
                        ${credentialsHtml}
                    </div>
                `;
                submitBtn.disabled = false;
            } else {
                const validCount = credentialsValidation.filter(cv => cv.isValid).length;
                const invalidCount = credentialsValidation.length - validCount;
                validationResult.style.cssText = 'display: block; margin-bottom: 16px; padding: 12px; border-radius: 8px; background: #fef2f2; border: 1px solid #fecaca; color: #991b1b;';
                validationResult.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
                        <i class="fas fa-exclamation-triangle"></i>
                        <strong>Batch validation failed</strong>
                        <span style="font-weight: normal; font-size: 12px;">(${invalidCount} credentials missing required fields)</span>
                    </div>
                    <div style="max-height: 200px; overflow-y: auto;">
                        ${credentialsHtml}
                    </div>
                    <p style="margin: 12px 0 0 0; font-size: 12px; padding: 8px; background: #fee2e2; border-radius: 4px;">
                        <i class="fas fa-lightbulb" style="color: #dc2626;"></i>
                        Please ensure each credential contains all required fields: clientId, clientSecret, accessToken, refreshToken
                    </p>
                `;
                submitBtn.disabled = true;
            }
            
            // Show JSON preview (batch mode)
            jsonPreview.style.display = 'block';
            const previewData = mergedCredentials.map(cred => {
                const preview = { ...cred };
                if (preview.clientSecret) {
                    preview.clientSecret = preview.clientSecret.substring(0, 8) + '...' + preview.clientSecret.slice(-4);
                }
                if (preview.accessToken) {
                    preview.accessToken = preview.accessToken.substring(0, 20) + '...' + preview.accessToken.slice(-10);
                }
                if (preview.refreshToken) {
                    preview.refreshToken = preview.refreshToken.substring(0, 10) + '...' + preview.refreshToken.slice(-6);
                }
                return preview;
            });
            jsonContent.textContent = JSON.stringify(previewData, null, 2);
            
        } else {
            // Single import mode: original logic
            const hasClientId = !!mergedCredentials.clientId;
            const hasClientSecret = !!mergedCredentials.clientSecret;
            const hasAccessToken = !!mergedCredentials.accessToken;
            const hasRefreshToken = !!mergedCredentials.refreshToken;
            
            // All four fields must be present
            const isValid = hasClientId && hasClientSecret && hasAccessToken && hasRefreshToken;
            
            // Build field status list
            const fieldsList = [
                { key: 'clientId', has: hasClientId },
                { key: 'clientSecret', has: hasClientSecret },
                { key: 'accessToken', has: hasAccessToken },
                { key: 'refreshToken', has: hasRefreshToken }
            ];
            
            const fieldsHtml = fieldsList.map(f => `
                <li>${f.key}: ${f.has
                    ? `<code style="background: #dcfce7; padding: 1px 4px; border-radius: 2px; color: #166534;">✓ ${t('common.found')}</code>`
                    : `<code style="background: #fecaca; padding: 1px 4px; border-radius: 2px; color: #991b1b;">✗ ${t('common.missing')}</code>`
                }</li>
            `).join('');
            
            if (isValid) {
                validationResult.style.cssText = 'display: block; margin-bottom: 16px; padding: 12px; border-radius: 8px; background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534;';
                validationResult.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <i class="fas fa-check-circle"></i>
                        <strong data-i18n="oauth.kiro.awsValidationSuccess">${t('oauth.kiro.awsValidationSuccess')}</strong>
                    </div>
                    <ul style="margin: 8px 0 0 24px; font-size: 13px; list-style: none; padding: 0;">
                        ${fieldsHtml}
                    </ul>
                `;
                submitBtn.disabled = false;
            } else {
                const missingCount = fieldsList.filter(f => !f.has).length;
                validationResult.style.cssText = 'display: block; margin-bottom: 16px; padding: 12px; border-radius: 8px; background: #fef2f2; border: 1px solid #fecaca; color: #991b1b;';
                validationResult.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <i class="fas fa-exclamation-triangle"></i>
                        <strong>${t('oauth.kiro.awsValidationFailed')}</strong>
                        <span style="font-weight: normal; font-size: 12px;">(${t('oauth.kiro.awsMissingFields', { count: missingCount })})</span>
                    </div>
                    <ul style="margin: 8px 0 0 24px; font-size: 13px; list-style: none; padding: 0;">
                        ${fieldsHtml}
                    </ul>
                    <p style="margin: 12px 0 0 0; font-size: 12px; padding: 8px; background: #fee2e2; border-radius: 4px;">
                        <i class="fas fa-lightbulb" style="color: #dc2626;"></i>
                        <span data-i18n="oauth.kiro.awsUploadMore">${t('oauth.kiro.awsUploadMore')}</span>
                    </p>
                `;
                submitBtn.disabled = true;
            }
            
            // Show JSON preview (single mode)
            jsonPreview.style.display = 'block';
            
            // Mask sensitive info
            const previewData = { ...mergedCredentials };
            if (previewData.clientSecret) {
                previewData.clientSecret = previewData.clientSecret.substring(0, 8) + '...' + previewData.clientSecret.slice(-4);
            }
            if (previewData.accessToken) {
                previewData.accessToken = previewData.accessToken.substring(0, 20) + '...' + previewData.accessToken.slice(-10);
            }
            if (previewData.refreshToken) {
                previewData.refreshToken = previewData.refreshToken.substring(0, 10) + '...' + previewData.refreshToken.slice(-6);
            }
            
            jsonContent.textContent = JSON.stringify(previewData, null, 2);
        }
    }
    
    // Read file content
    function readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(e);
            reader.readAsText(file);
        });
    }
    
    // Close button event
    [closeBtn, cancelBtn].forEach(btn => {
        btn.addEventListener('click', () => {
            modal.remove();
        });
    });
    
    // Submit button event
    submitBtn.addEventListener('click', async () => {
        if (!mergedCredentials) {
            showToast(t('common.warning'), t('oauth.kiro.awsNoCredentials'), 'warning');
            return;
        }
        
        // Check if batch import (array)
        const isBatchImport = Array.isArray(mergedCredentials);
        
        // Disable buttons and input
        submitBtn.disabled = true;
        cancelBtn.disabled = true;
        submitBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> <span>${t('oauth.kiro.awsImporting')}</span>`;
        
        if (currentMode === 'json') {
            jsonInputTextarea.disabled = true;
        }
        
        let importSuccess = false; // Track whether import succeeded
        
        try {
            if (isBatchImport) {
                // Batch import mode - use SSE streaming response
                // Ensure each credential has authMethod
                const credentialsToImport = mergedCredentials.map(cred => ({
                    ...cred,
                    authMethod: cred.authMethod || 'builder-id'
                }));
                
                // Create progress display area
                validationResult.style.cssText = 'display: block; margin-top: 16px; padding: 12px; border-radius: 8px; background: #f3f4f6; border: 1px solid #d1d5db;';
                validationResult.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                        <i class="fas fa-spinner fa-spin" style="color: #ff9900;"></i>
                        <strong id="awsBatchProgressText">${t('oauth.kiro.importingProgress', { current: 0, total: credentialsToImport.length })}</strong>
                    </div>
                    <div class="progress-bar" style="margin: 8px 0; height: 8px; background: #e5e7eb; border-radius: 4px; overflow: hidden;">
                        <div id="awsImportProgressBar" style="height: 100%; width: 0%; background: #ff9900; transition: width 0.3s;"></div>
                    </div>
                    <div id="awsBatchResultsList" style="max-height: 200px; overflow-y: auto; font-size: 12px; margin-top: 8px;"></div>
                `;
                
                const progressText = validationResult.querySelector('#awsBatchProgressText');
                const progressBar = validationResult.querySelector('#awsImportProgressBar');
                const resultsList = validationResult.querySelector('#awsBatchResultsList');
                
                // Use fetch + SSE for streaming response
                const response = await fetch('/api/kiro/import-aws-credentials', {
                    method: 'POST',
                    headers: window.apiClient ? window.apiClient.getAuthHeaders() : {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ credentials: credentialsToImport })
                });
                
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';
                
                let successCount = 0;
                let failedCount = 0;
                
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    
                    buffer += decoder.decode(value, { stream: true });
                    
                    // Parse SSE events
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';
                    
                    let eventType = '';
                    let eventData = '';
                    
                    for (const line of lines) {
                        if (line.startsWith('event: ')) {
                            eventType = line.substring(7).trim();
                        } else if (line.startsWith('data: ')) {
                            eventData = line.substring(6).trim();
                            
                            if (eventType && eventData) {
                                try {
                                    const data = JSON.parse(eventData);
                                    
                                    if (eventType === 'start') {
                                        console.log(`[AWS Batch Import] Starting import of ${data.total} credentials`);
                                    } else if (eventType === 'progress') {
                                        const { index, total, current, successCount: sc, failedCount: fc } = data;
                                        successCount = sc;
                                        failedCount = fc;
                                        
                                        // Update progress bar
                                        const percentage = Math.round((index / total) * 100);
                                        progressBar.style.width = `${percentage}%`;
                                        
                                        // Update progress text
                                        progressText.textContent = t('oauth.kiro.importingProgress', { current: index, total: total });
                                        
                                        // Add result item
                                        const resultItem = document.createElement('div');
                                        resultItem.style.cssText = 'padding: 4px 0; border-bottom: 1px solid rgba(0,0,0,0.1);';
                                        
                                        if (current.success) {
                                            resultItem.innerHTML = `Credential ${current.index}: <span style="color: #166534;">✓ ${current.path}</span>`;
                                        } else if (current.error === 'duplicate') {
                                            resultItem.innerHTML = `Credential ${current.index}: <span style="color: #d97706;">⚠ ${t('oauth.kiro.duplicateCredentials')}</span>
                                                ${current.existingPath ? `<span style="color: #666; font-size: 11px;">(${current.existingPath})</span>` : ''}`;
                                        } else {
                                            resultItem.innerHTML = `Credential ${current.index}: <span style="color: #991b1b;">✗ ${current.error}</span>`;
                                        }
                                        
                                        resultsList.appendChild(resultItem);
                                        resultsList.scrollTop = resultsList.scrollHeight;
                                        
                                    } else if (eventType === 'complete') {
                                        progressBar.style.width = '100%';
                                        
                                        const isAllSuccess = data.failedCount === 0;
                                        const isAllFailed = data.successCount === 0;
                                        
                                        let resultClass, resultIcon, resultMessage;
                                        if (isAllSuccess) {
                                            resultClass = 'background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534;';
                                            resultIcon = 'fa-check-circle';
                                            resultMessage = t('oauth.kiro.awsImportSuccess') + ` (${data.successCount})`;
                                        } else if (isAllFailed) {
                                            resultClass = 'background: #fef2f2; border: 1px solid #fecaca; color: #991b1b;';
                                            resultIcon = 'fa-times-circle';
                                            resultMessage = t('oauth.kiro.awsImportAllFailed', { count: data.failedCount });
                                        } else {
                                            resultClass = 'background: #fffbeb; border: 1px solid #fde68a; color: #92400e;';
                                            resultIcon = 'fa-exclamation-triangle';
                                            resultMessage = t('oauth.kiro.importPartial', { success: data.successCount, failed: data.failedCount });
                                        }
                                        
                                        validationResult.style.cssText = `display: block; margin-top: 16px; padding: 12px; border-radius: 8px; ${resultClass}`;
                                        
                                        const headerDiv = validationResult.querySelector('div:first-child');
                                        headerDiv.innerHTML = `<i class="fas ${resultIcon}"></i> <strong>${resultMessage}</strong>`;
                                        
                                        // If any succeeded, mark success and refresh provider list
                                        if (data.successCount > 0) {
                                            importSuccess = true;
                                            loadProviders();
                                            loadConfigList();
                                        }
                                        
                                    } else if (eventType === 'error') {
                                        throw new Error(data.error);
                                    }
                                } catch (parseError) {
                                    console.warn('Failed to parse SSE data:', parseError);
                                }
                                
                                eventType = '';
                                eventData = '';
                            }
                        }
                    }
                }
                
            } else {
                // Single import mode
                // Ensure authMethod is builder-id (AWS account mode)
                if (!mergedCredentials.authMethod) {
                    mergedCredentials.authMethod = 'builder-id';
                }
                
                const response = await window.apiClient.post('/kiro/import-aws-credentials', {
                    credentials: mergedCredentials
                });
                
                if (response.success) {
                    importSuccess = true;
                    showToast(t('common.success'), t('oauth.kiro.awsImportSuccess'), 'success');
                    modal.remove();
                    
                    // Refresh provider list and config list
                    loadProviders();
                    loadConfigList();
                } else if (response.error === 'duplicate') {
                    // Show duplicate credential warning
                    const existingPath = response.existingPath || '';
                    showToast(t('common.warning'), t('oauth.kiro.duplicateCredentials') + (existingPath ? ` (${existingPath})` : ''), 'warning');
                } else {
                    showToast(t('common.error'), response.error || t('oauth.kiro.awsImportFailed'), 'error');
                }
            }
        } catch (error) {
            console.error('AWS import failed:', error);
            
            // Update error display
            validationResult.style.cssText = 'display: block; margin-top: 16px; padding: 12px; border-radius: 8px; background: #fef2f2; border: 1px solid #fecaca; color: #991b1b;';
            validationResult.innerHTML = `
                <div style="display: flex; align-items: center; gap: 8px;">
                    <i class="fas fa-times-circle"></i>
                    <strong>${t('oauth.kiro.awsImportFailed')}: ${error.message}</strong>
                </div>
            `;
            
            showToast(t('common.error'), t('oauth.kiro.awsImportFailed') + ': ' + error.message, 'error');
        } finally {
            // Cancel button is always enabled
            cancelBtn.disabled = false;
            
            // Only re-enable submit button when import fails
            if (!importSuccess) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = `<i class="fas fa-check"></i> <span data-i18n="oauth.kiro.awsConfirmImport">${t('oauth.kiro.awsConfirmImport')}</span>`;
                
                if (currentMode === 'json') {
                    jsonInputTextarea.disabled = false;
                }
            } else {
                // After successful import, keep submit button disabled and show success icon
                submitBtn.innerHTML = `<i class="fas fa-check-circle"></i> <span>${t('common.success')}</span>`;
            }
        }
    });
}

/**
 * Execute generate authorization URL
 * @param {string} providerType - Provider type
 * @param {Object} extraOptions - Extra options
 */
async function executeGenerateAuthUrl(providerType, extraOptions = {}) {
    try {
        showToast(t('common.info'), t('modal.provider.auth.initializing'), 'info');
        
        // Use getProviderKey from fileUploadHandler to get directory name
        const providerDir = fileUploadHandler.getProviderKey(providerType);

        const response = await window.apiClient.post(
            `/providers/${encodeURIComponent(providerType)}/generate-auth-url`,
            {
                saveToConfigs: true,
                providerDir: providerDir,
                ...extraOptions
            }
        );
        
        if (response.success && response.authUrl) {
            // If targetInputId is provided, set up success listener
            if (extraOptions.targetInputId) {
                const targetInputId = extraOptions.targetInputId;
                const handleSuccess = (e) => {
                    const data = e.detail;
                    if (data.provider === providerType && data.relativePath) {
                        const input = document.getElementById(targetInputId);
                        if (input) {
                            input.value = data.relativePath;
                            input.dispatchEvent(new Event('input', { bubbles: true }));
                            showToast(t('common.success'), t('modal.provider.auth.success'), 'success');
                        }
                        window.removeEventListener('oauth_success_event', handleSuccess);
                    }
                };
                window.addEventListener('oauth_success_event', handleSuccess);
            }

            // Show auth info modal
            showAuthModal(response.authUrl, response.authInfo);
        } else {
            showToast(t('common.error'), t('modal.provider.auth.failed'), 'error');
        }
    } catch (error) {
        console.error('Failed to generate auth URL:', error);
        showToast(t('common.error'), t('modal.provider.auth.failed') + `: ${error.message}`, 'error');
    }
}

/**
 * Get auth file path for provider
 * @param {string} provider - Provider type
 * @returns {string} Auth file path
 */
function getAuthFilePath(provider) {
    const authFilePaths = {
        'gemini-cli-oauth': '~/.gemini/oauth_creds.json',
        'gemini-antigravity': '~/.antigravity/oauth_creds.json',
        'openai-qwen-oauth': '~/.qwen/oauth_creds.json',
        'claude-kiro-oauth': '~/.aws/sso/cache/kiro-auth-token.json',
        'openai-iflow': '~/.iflow/oauth_creds.json'
    };
    return authFilePaths[provider] || (getCurrentLanguage() === 'en-US' ? 'Unknown Path' : 'Unknown Path');
}

/**
 * Show auth info modal
 * @param {string} authUrl - Authorization URL
 * @param {Object} authInfo - Auth info
 */
function showAuthModal(authUrl, authInfo) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.display = 'flex';
    
    // Get auth file path
    const authFilePath = getAuthFilePath(authInfo.provider);
    
    // Get the required port number (from authInfo or current page URL)
    const requiredPort = authInfo.callbackPort || authInfo.port || window.location.port || '3000';
    const isDeviceFlow = authInfo.provider === 'openai-qwen-oauth' || (authInfo.provider === 'claude-kiro-oauth' && authInfo.authMethod === 'builder-id');

    let instructionsHtml = '';
    if (authInfo.provider === 'openai-qwen-oauth') {
        instructionsHtml = `
            <div class="auth-instructions">
                <h4 data-i18n="oauth.modal.steps">${t('oauth.modal.steps')}</h4>
                <ol>
                    <li data-i18n="oauth.modal.step1">${t('oauth.modal.step1')}</li>
                    <li data-i18n="oauth.modal.step2.qwen">${t('oauth.modal.step2.qwen')}</li>
                    <li data-i18n="oauth.modal.step3">${t('oauth.modal.step3')}</li>
                    <li data-i18n="oauth.modal.step4.qwen" data-i18n-params='{"min":"${Math.floor(authInfo.expiresIn / 60)}"}'>${t('oauth.modal.step4.qwen', { min: Math.floor(authInfo.expiresIn / 60) })}</li>
                </ol>
            </div>
        `;
    } else if (authInfo.provider === 'claude-kiro-oauth') {
        const methodDisplay = authInfo.authMethod === 'builder-id' ? 'AWS Builder ID' : `Social (${authInfo.socialProvider || 'Google'})`;
        const methodAccount = authInfo.authMethod === 'builder-id' ? 'AWS Builder ID' : authInfo.socialProvider || 'Google';
        instructionsHtml = `
            <div class="auth-instructions">
                <h4 data-i18n="oauth.modal.steps">${t('oauth.modal.steps')}</h4>
                <p><strong data-i18n="oauth.kiro.authMethodLabel">${t('oauth.kiro.authMethodLabel')}</strong> ${methodDisplay}</p>
                <ol>
                    <li data-i18n="oauth.kiro.step1">${t('oauth.kiro.step1')}</li>
                    <li data-i18n="oauth.kiro.step2" data-i18n-params='{"method":"${methodAccount}"}'>${t('oauth.kiro.step2', { method: methodAccount })}</li>
                    <li data-i18n="oauth.kiro.step3">${t('oauth.kiro.step3')}</li>
                    <li data-i18n="oauth.kiro.step4">${t('oauth.kiro.step4')}</li>
                </ol>
            </div>
        `;
    } else if (authInfo.provider === 'openai-iflow') {
        instructionsHtml = `
            <div class="auth-instructions">
                <h4 data-i18n="oauth.modal.steps">${t('oauth.modal.steps')}</h4>
                <ol>
                    <li data-i18n="oauth.iflow.step1">${t('oauth.iflow.step1')}</li>
                    <li data-i18n="oauth.iflow.step2">${t('oauth.iflow.step2')}</li>
                    <li data-i18n="oauth.iflow.step3">${t('oauth.iflow.step3')}</li>
                    <li data-i18n="oauth.iflow.step4">${t('oauth.iflow.step4')}</li>
                </ol>
            </div>
        `;
    } else {
        instructionsHtml = `
            <div class="auth-instructions">
                <h4 data-i18n="oauth.modal.steps">${t('oauth.modal.steps')}</h4>
                <ol>
                    <li data-i18n="oauth.modal.step1">${t('oauth.modal.step1')}</li>
                    <li data-i18n="oauth.modal.step2.google">${t('oauth.modal.step2.google')}</li>
                    <li data-i18n="oauth.modal.step4.google">${t('oauth.modal.step4.google')}</li>
                    <li data-i18n="oauth.modal.step3">${t('oauth.modal.step3')}</li>
                </ol>
            </div>
        `;
    }
    
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 600px;">
            <div class="modal-header">
                <h3><i class="fas fa-key"></i> <span data-i18n="oauth.modal.title">${t('oauth.modal.title')}</span></h3>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <div class="auth-info">
                    <p><strong data-i18n="oauth.modal.provider">${t('oauth.modal.provider')}</strong> ${authInfo.provider}</p>
                    <div class="port-info-section" style="margin: 12px 0; padding: 12px; background: #fef3c7; border: 1px solid #fcd34d; border-radius: 8px; position: relative;">
                        ${(authInfo.provider === 'claude-kiro-oauth' && authInfo.authMethod === 'builder-id') ? `
                        <button class="regenerate-builder-id-btn" title="${t('common.generate')}" style="position: absolute; top: 12px; right: 12px; background: none; border: 1px solid #d97706; border-radius: 4px; cursor: pointer; color: #d97706; padding: 4px 8px;">
                            <i class="fas fa-sync-alt"></i>
                        </button>
                        ` : ''}
                        <div style="margin: 0; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                            <i class="fas fa-network-wired" style="color: #d97706;"></i>
                            <strong data-i18n="oauth.modal.requiredPort">${t('oauth.modal.requiredPort')}</strong>
                            ${isDeviceFlow ?
                                `<code style="background: #fff; padding: 2px 8px; border-radius: 4px; font-weight: bold; color: #d97706;">${requiredPort}</code>` :
                                `<div style="display: flex; align-items: center; gap: 4px;">
                                    <input type="number" class="auth-port-input" value="${requiredPort}" style="width: 80px; padding: 2px 8px; border: 1px solid #d97706; border-radius: 4px; font-weight: bold; color: #d97706; background: white;">
                                    <button class="regenerate-port-btn" title="${t('common.generate')}" style="background: none; border: 1px solid #d97706; border-radius: 4px; cursor: pointer; color: #d97706; padding: 2px 6px;">
                                        <i class="fas fa-sync-alt"></i>
                                    </button>
                                </div>`
                            }
                        </div>
                        <p style="margin: 8px 0 0 0; font-size: 0.85rem; color: #92400e;" data-i18n="oauth.modal.portNote">${t('oauth.modal.portNote')}</p>
                        ${(authInfo.provider === 'claude-kiro-oauth' && authInfo.authMethod === 'builder-id') ? `
                        <div class="builder-id-url-section" style="margin-top: 12px; padding-top: 12px; border-top: 1px dashed #fcd34d;">
                            <label style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px; font-size: 13px; font-weight: 600; color: #92400e;">
                                <i class="fas fa-link"></i>
                                <span data-i18n="oauth.kiro.builderIDStartURL">${t('oauth.kiro.builderIDStartURL') || 'Builder ID Start URL'}</span>
                                <span style="font-weight: normal; color: #b45309;">(${t('common.optional') || 'Optional'})</span>
                            </label>
                            <div style="display: flex; align-items: center; gap: 4px;">
                                <input type="text" class="builder-id-start-url-input"
                                    value="${authInfo.builderIDStartURL || 'https://view.awsapps.com/start'}"
                                    placeholder="https://view.awsapps.com/start"
                                    style="flex: 1; padding: 6px 10px; border: 1px solid #fcd34d; border-radius: 4px; font-size: 13px; color: #92400e; background: white;"
                                />
                            </div>
                            <p style="margin: 6px 0 0 0; font-size: 0.75rem; color: #b45309;">
                                <i class="fas fa-info-circle"></i>
                                <span data-i18n="oauth.kiro.builderIDStartURLHint">${t('oauth.kiro.builderIDStartURLHint') || 'If you use AWS IAM Identity Center, enter your Start URL'}</span>
                            </p>
                        </div>
                        <div class="builder-id-region-section" style="margin-top: 12px; padding-top: 12px; border-top: 1px dashed #fcd34d;">
                            <label style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px; font-size: 13px; font-weight: 600; color: #92400e;">
                                <i class="fas fa-globe"></i>
                                <span>AWS Region</span>
                            </label>
                            <div style="display: flex; align-items: center; gap: 4px;">
                                <input type="text" class="builder-id-region-input"
                                    value="${authInfo.region || 'us-east-1'}"
                                    placeholder="us-east-1"
                                    style="flex: 1; padding: 6px 10px; border: 1px solid #fcd34d; border-radius: 4px; font-size: 13px; color: #92400e; background: white;"
                                />
                            </div>
                        </div>
                        ` : ''}
                    </div>
                    ${instructionsHtml}
                    <div class="auth-url-section">
                        <label data-i18n="oauth.modal.urlLabel">${t('oauth.modal.urlLabel')}</label>
                        <div class="auth-url-container">
                            <input type="text" readonly value="${authUrl}" class="auth-url-input">
                            <button class="copy-btn" data-i18n="oauth.modal.copyTitle" title="Copy link">
                                <i class="fas fa-copy"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button class="modal-cancel" data-i18n="modal.provider.cancel">${t('modal.provider.cancel')}</button>
                <button class="open-auth-btn">
                    <i class="fas fa-external-link-alt"></i>
                    <span data-i18n="oauth.modal.openInBrowser">${t('oauth.modal.openInBrowser')}</span>
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Close button event
    const closeBtn = modal.querySelector('.modal-close');
    const cancelBtn = modal.querySelector('.modal-cancel');
    [closeBtn, cancelBtn].forEach(btn => {
        btn.addEventListener('click', () => {
            modal.remove();
        });
    });
    
    // Regenerate button event
    const regenerateBtn = modal.querySelector('.regenerate-port-btn');
    if (regenerateBtn) {
        regenerateBtn.onclick = async () => {
            const newPort = modal.querySelector('.auth-port-input').value;
            if (newPort && newPort !== requiredPort) {
                modal.remove();
                // Build re-request parameters
                const options = { ...authInfo, port: newPort };
                // Remove fields not needed for backend
                delete options.provider;
                delete options.redirectUri;
                delete options.callbackPort;
                
                await executeGenerateAuthUrl(authInfo.provider, options);
            }
        };
    }

    // Builder ID Start URL regenerate button event
    const regenerateBuilderIdBtn = modal.querySelector('.regenerate-builder-id-btn');
    if (regenerateBuilderIdBtn) {
        regenerateBuilderIdBtn.onclick = async () => {
            const builderIdStartUrl = modal.querySelector('.builder-id-start-url-input').value.trim();
            const region = modal.querySelector('.builder-id-region-input').value.trim();
            modal.remove();
            // Build re-request parameters
            const options = {
                ...authInfo,
                builderIDStartURL: builderIdStartUrl || 'https://view.awsapps.com/start',
                region: region || 'us-east-1'
            };
            // Remove fields not needed for backend
            delete options.provider;
            delete options.redirectUri;
            delete options.callbackPort;
            
            await executeGenerateAuthUrl(authInfo.provider, options);
        };
    }

    // Copy link button
    const copyBtn = modal.querySelector('.copy-btn');
    copyBtn.addEventListener('click', () => {
        const input = modal.querySelector('.auth-url-input');
        input.select();
        document.execCommand('copy');
        showToast(t('common.success'), t('oauth.success.msg'), 'success');
    });
    
    // Open in browser button
    const openBtn = modal.querySelector('.open-auth-btn');
    openBtn.addEventListener('click', () => {
        // Open in a child window to monitor URL changes
        const width = 600;
        const height = 700;
        const left = (window.screen.width - width) / 2 + 600;
        const top = (window.screen.height - height) / 2;
        
        const authWindow = window.open(
            authUrl,
            'OAuthAuthWindow',
            `width=${width},height=${height},left=${left},top=${top},status=no,resizable=yes,scrollbars=yes`
        );

        let pollTimer = null;
        const cleanupAuthListeners = () => {
            if (pollTimer) {
                clearInterval(pollTimer);
                pollTimer = null;
            }
            window.removeEventListener('oauth_success_event', handleOAuthSuccess);
            window.removeEventListener('message', handlePopupMessage);
        };

        // Listen for OAuth success event, auto-close window and modal
        const handleOAuthSuccess = () => {
            if (authWindow && !authWindow.closed) {
                authWindow.close();
            }
            modal.remove();
            cleanupAuthListeners();
            
            // Refresh config and provider list after successful authorization
            loadProviders();
            loadConfigList();
        };

        // When callback page posts a message, parent page closes child window first
        const handlePopupMessage = (event) => {
            if (event.origin !== window.location.origin) {
                return;
            }

            const data = event.data;
            if (!data || data.type !== 'oauth-popup-complete') {
                return;
            }

            if (data.provider && data.provider !== authInfo.provider) {
                return;
            }

            handleOAuthSuccess();
        };

        window.addEventListener('oauth_success_event', handleOAuthSuccess);
        window.addEventListener('message', handlePopupMessage);
        
        if (authWindow) {
            showToast(t('common.info'), t('oauth.window.opened'), 'info');
            
            // Add manual callback URL input UI
            const urlSection = modal.querySelector('.auth-url-section');
            if (urlSection && !modal.querySelector('.manual-callback-section')) {
            const manualInputHtml = `
                <div class="manual-callback-section" style="margin-top: 20px; padding: 15px; background: #fffbeb; border: 1px solid #fef3c7; border-radius: 8px;">
                    <h4 style="color: #92400e; margin-bottom: 8px;"><i class="fas fa-exclamation-circle"></i> <span data-i18n="oauth.manual.title">${t('oauth.manual.title')}</span></h4>
                    <p style="font-size: 0.875rem; color: #b45309; margin-bottom: 10px;" data-i18n-html="oauth.manual.desc">${t('oauth.manual.desc')}</p>
                    <div class="auth-url-container" style="display: flex; gap: 5px;">
                        <input type="text" class="manual-callback-input" data-i18n="oauth.manual.placeholder" placeholder="Paste callback URL (containing code=...)" style="flex: 1; padding: 8px; border: 1px solid #fcd34d; border-radius: 4px; background: white; color: black;">
                        <button class="btn btn-success apply-callback-btn" style="padding: 8px 15px; white-space: nowrap; background: #059669; color: white; border: none; border-radius: 4px; cursor: pointer;">
                            <i class="fas fa-check"></i> <span data-i18n="oauth.manual.submit">${t('oauth.manual.submit')}</span>
                        </button>
                    </div>
                </div>
            `;
            urlSection.insertAdjacentHTML('afterend', manualInputHtml);
            }

            const manualInput = modal.querySelector('.manual-callback-input');
            const applyBtn = modal.querySelector('.apply-callback-btn');

            // Core logic for processing callback URL
            const processCallback = (urlStr, isManualInput = false) => {
                try {
                    // Try to clean URL (some users may copy extra text)
                    const cleanUrlStr = urlStr.trim().match(/https?:\/\/[^\s]+/)?.[0] || urlStr.trim();
                    const url = new URL(cleanUrlStr);
                    
                    if (url.searchParams.has('code') || url.searchParams.has('token')) {
                        if (pollTimer) {
                            clearInterval(pollTimer);
                            pollTimer = null;
                        }
                        // Build locally processable URL, only modify hostname, keep original port
                        const localUrl = new URL(url.href);
                        localUrl.hostname = window.location.hostname;
                        localUrl.protocol = window.location.protocol;
                        
                        showToast(t('common.info'), t('oauth.processing'), 'info');
                        
                        // If manual input, process via fetch request, then close child window
                        if (isManualInput) {
                            // Process manually entered callback URL via server API
                            window.apiClient.post('/oauth/manual-callback', {
                                provider: authInfo.provider,
                                callbackUrl: url.href, // Use localhost to access
                                authMethod: authInfo.authMethod
                            })
                                .then(response => {
                                    if (response.success) {
                                        console.log('OAuth callback processed successfully');
                                        handleOAuthSuccess();
                                        showToast(t('common.success'), t('oauth.success.msg'), 'success');
                                    } else {
                                        console.error('OAuth callback processing failed:', response.error);
                                        showToast(t('common.error'), response.error || t('oauth.error.process'), 'error');
                                    }
                                })
                                .catch(err => {
                                    console.error('OAuth callback request failed:', err);
                                    showToast(t('common.error'), t('oauth.error.process'), 'error');
                                });
                        } else {
                            // Auto-listen mode: redirect in child window first (if still open)
                            if (authWindow && !authWindow.closed) {
                                authWindow.location.href = localUrl.href;
                            } else {
                                // Fallback: via fetch request
                                // Process callback via fetch to local server
                                fetch(localUrl.href)
                                    .then(response => {
                                        if (response.ok) {
                                            console.log('OAuth callback processed successfully');
                                        } else {
                                            console.error('OAuth callback processing failed:', response.status);
                                        }
                                    })
                                    .catch(err => {
                                        console.error('OAuth callback request failed:', err);
                                    });
                            }
                        }
                        
                    } else {
                        showToast(t('common.warning'), t('oauth.invalid.url'), 'warning');
                    }
                } catch (err) {
                    console.error('Failed to process callback:', err);
                    showToast(t('common.error'), t('oauth.error.format'), 'error');
                }
            };

            applyBtn.addEventListener('click', () => {
                processCallback(manualInput.value, true);
            });

            // Start timer to poll child window URL
            pollTimer = setInterval(() => {
                try {
                    if (authWindow.closed) {
                        cleanupAuthListeners();
                        return;
                    }
                    // If readable, it means we returned to same origin
                    const currentUrl = authWindow.location.href;
                    if (currentUrl && (currentUrl.includes('code=') || currentUrl.includes('token='))) {
                        processCallback(currentUrl);
                    }
                } catch (e) {
                    // Cross-origin restriction is normal
                }
            }, 1000);
        } else {
            showToast(t('common.error'), t('oauth.window.blocked'), 'error');
        }
    });
    
}

/**
 * Show restart required modal
 * @param {string} version - Version to update to
 */
function showRestartRequiredModal(version) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay restart-required-modal';
    modal.style.display = 'flex';
    
    modal.innerHTML = `
        <div class="modal-content restart-modal-content" style="max-width: 420px;">
            <div class="modal-header restart-modal-header">
                <h3><i class="fas fa-check-circle" style="color: #10b981;"></i> <span data-i18n="dashboard.update.restartTitle">${t('dashboard.update.restartTitle')}</span></h3>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body" style="text-align: center; padding: 20px;">
                <p style="font-size: 1rem; color: #374151; margin: 0;" data-i18n="dashboard.update.restartMsg" data-i18n-params='{"version":"${version}"}'>${t('dashboard.update.restartMsg', { version })}</p>
            </div>
            <div class="modal-footer">
                <button class="btn restart-confirm-btn">
                    <i class="fas fa-check"></i>
                    <span data-i18n="common.confirm">${t('common.confirm')}</span>
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Close button event
    const closeBtn = modal.querySelector('.modal-close');
    const confirmBtn = modal.querySelector('.restart-confirm-btn');
    
    const closeModal = () => {
        modal.remove();
    };
    
    closeBtn.addEventListener('click', closeModal);
    confirmBtn.addEventListener('click', closeModal);
    
    // Click overlay to close
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });
}

/**
 * Check for updates
 * @param {boolean} silent - Whether to check silently (no Toast)
 */
async function checkUpdate(silent = false) {
    const checkBtn = document.getElementById('checkUpdateBtn');
    const updateBtn = document.getElementById('performUpdateBtn');
    const updateBadge = document.getElementById('updateBadge');
    const latestVersionText = document.getElementById('latestVersionText');
    const versionSelectWrapper = document.getElementById('versionSelectWrapper');
    const versionSelect = document.getElementById('versionSelect');
    const checkBtnIcon = checkBtn?.querySelector('i');
    const checkBtnText = checkBtn?.querySelector('span');

    try {
        if (!silent && checkBtn) {
            checkBtn.disabled = true;
            if (checkBtnIcon) checkBtnIcon.className = 'fas fa-spinner fa-spin';
            if (checkBtnText) checkBtnText.textContent = t('dashboard.update.checking');
        }

        const data = await window.apiClient.get('/check-update');

        // Process version list
        if (versionSelect && data.availableVersions && data.availableVersions.length > 0) {
            versionSelect.innerHTML = '';
            data.availableVersions.forEach(version => {
                const option = document.createElement('option');
                option.value = version;
                option.textContent = version;
                // If latest version, add marker
                if (version === data.latestVersion) {
                    option.textContent += ` (${t('dashboard.update.latest') || 'Latest'})`;
                }
                // If current version, add marker
                if (version === data.localVersion || version === `v${data.localVersion}`) {
                    option.textContent += ` (${t('dashboard.update.current') || 'Current'})`;
                    option.selected = true;
                }
                versionSelect.appendChild(option);
            });
            
            if (versionSelectWrapper) versionSelectWrapper.style.display = 'block';
            if (updateBtn) {
                updateBtn.style.display = 'inline-flex';
                // If rollback, modify button text
                updateBtn.querySelector('span').textContent = t('dashboard.update.perform');
            }
        }

        if (data.hasUpdate) {
            if (updateBadge) updateBadge.style.display = 'inline-flex';
            if (latestVersionText) latestVersionText.textContent = data.latestVersion;
            
            // If new version available and no specific version selected, default to latest
            if (versionSelect && data.latestVersion) {
                versionSelect.value = data.latestVersion;
            }

            if (!silent) {
                showToast(t('common.info'), t('dashboard.update.hasUpdate', { version: data.latestVersion }), 'info');
            }
        } else {
            if (updateBadge) updateBadge.style.display = 'none';
            if (!silent) {
                showToast(t('common.info'), t('dashboard.update.upToDate'), 'success');
            }
        }
    } catch (error) {
        console.error('Check update failed:', error);
        if (!silent) {
            showToast(t('common.error'), t('dashboard.update.failed', { error: error.message }), 'error');
        }
    } finally {
        if (checkBtn) {
            checkBtn.disabled = false;
            if (checkBtnIcon) checkBtnIcon.className = 'fas fa-sync-alt';
            if (checkBtnText) checkBtnText.textContent = t('dashboard.update.check');
        }
    }
}

/**
 * Perform update
 */
async function performUpdate() {
    const updateBtn = document.getElementById('performUpdateBtn');
    const versionSelect = document.getElementById('versionSelect');
    const selectedVersion = versionSelect?.value || '';

    if (!confirm(t('dashboard.update.confirmMsg', { version: selectedVersion }))) {
        return;
    }

    const updateBtnIcon = updateBtn?.querySelector('i');
    const updateBtnText = updateBtn?.querySelector('span');

    try {
        if (updateBtn) {
            updateBtn.disabled = true;
            if (updateBtnIcon) updateBtnIcon.className = 'fas fa-spinner fa-spin';
            if (updateBtnText) updateBtnText.textContent = t('dashboard.update.updating');
        }

        showToast(t('common.info'), t('dashboard.update.updating'), 'info');

        const data = await window.apiClient.post('/update', { version: selectedVersion });

        if (data.success) {
            if (data.updated) {
                // Code updated, directly trigger service restart
                showToast(t('common.success'), t('dashboard.update.success'), 'success');
                
                // Auto-restart service
                await restartServiceAfterUpdate();
            } else {
                // Already at target version
                showToast(t('common.info'), data.message || t('dashboard.update.upToDate'), 'info');
            }
        }
    } catch (error) {
        console.error('Update failed:', error);
        showToast(t('common.error'), t('dashboard.update.failed', { error: error.message }), 'error');
    } finally {
        if (updateBtn) {
            updateBtn.disabled = false;
            if (updateBtnIcon) updateBtnIcon.className = 'fas fa-download';
            if (updateBtnText) updateBtnText.textContent = t('dashboard.update.perform');
        }
    }
}

/**
 * Auto-restart service after update
 */
async function restartServiceAfterUpdate() {
    try {
        showToast(t('common.info'), t('header.restart.requesting'), 'info');
        
        const token = localStorage.getItem('authToken');
        const response = await fetch('/api/restart-service', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': token ? `Bearer ${token}` : ''
            }
        });
        
        const result = await response.json();
        
        if (response.ok && result.success) {
            showToast(t('common.success'), result.message || t('header.restart.success'), 'success');
            
            // If in worker mode, service will auto-restart, wait a few seconds then refresh page
            if (result.mode === 'worker') {
                setTimeout(() => {
                    showToast(t('common.info'), t('header.restart.reconnecting'), 'info');
                    // Wait for service to restart then refresh page
                    setTimeout(() => {
                        window.location.reload();
                    }, 3000);
                }, 2000);
            }
        } else {
            // Show error message
            const errorMsg = result.message || result.error?.message || t('header.restart.failed');
            showToast(t('common.error'), errorMsg, 'error');
            
            // If in standalone mode, show hint
            if (result.mode === 'standalone') {
                showToast(t('common.info'), result.hint, 'warning');
            }
        }
    } catch (error) {
        console.error('Restart after update failed:', error);
        showToast(t('common.error'), t('header.restart.failed') + ': ' + error.message, 'error');
    }
}

/**
 * Show add provider group modal
 * @param {string} defaultBaseType - Default base type
 */
function showAddProviderGroupModal(defaultBaseType = null) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.display = 'flex';
    modal.style.zIndex = '2000';
    
    // Get all base config templates and filter out existing custom groups
    // Ensure dropdown only shows clean base types (e.g. openai-custom), not existing suffixed groups
    const allBaseConfigs = getBaseProviderConfigs();
    const baseTypes = allBaseConfigs.filter(config => {
        // 1. Must be in the backend supported list
        const isSupported = cachedSupportedProviders.includes(config.id);
        
        // 2. Restrict to specific config group types (Claude Custom, OpenAI Custom, OpenAI Responses)
        const allowedTypes = ['claude-custom', 'openai-custom', 'openaiResponses-custom'];
        const isAllowed = allowedTypes.includes(config.id);
        
        return isSupported && isAllowed;
    });

    let optionsHtml = baseTypes.map(type => {
        const selected = (defaultBaseType && type.id === defaultBaseType) ? 'selected' : '';
        return `<option value="${type.id}" ${selected}>${type.name}</option>`;
    }).join('');

    const selectedConfig = allBaseConfigs.find(c => c.id === defaultBaseType);
    const baseTypeSectionHtml = defaultBaseType ? `
        <div class="form-group" style="margin-bottom: 15px;">
            <label style="display: block; margin-bottom: 5px; font-weight: 600;" data-i18n="providers.addGroup.baseType">${t('providers.addGroup.baseType')}</label>
            <div style="padding: 10px 12px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; display: flex; align-items: center; gap: 8px;">
                <i class="fas ${selectedConfig?.icon || 'fa-robot'}" style="color: #6b7280;"></i>
                <span style="font-weight: 500; color: #374151;">${selectedConfig?.name || defaultBaseType}</span>
            </div>
            <input type="hidden" id="groupBaseType" value="${defaultBaseType}">
        </div>
    ` : `
        <div class="form-group" style="margin-bottom: 15px;">
            <label style="display: block; margin-bottom: 5px; font-weight: 600;" data-i18n="providers.addGroup.baseType">${t('providers.addGroup.baseType')}</label>
            <select id="groupBaseType" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                ${optionsHtml}
            </select>
        </div>
    `;

    modal.innerHTML = `
        <div class="modal-content" style="max-width: 450px;">
            <div class="modal-header">
                <h3><i class="fas fa-folder-plus"></i> <span data-i18n="providers.addGroup.title">${t('providers.addGroup.title')}</span></h3>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
                ${baseTypeSectionHtml}
                <div class="form-group">
                    <label style="display: block; margin-bottom: 5px; font-weight: 600;" data-i18n="providers.addGroup.suffix">${t('providers.addGroup.suffix')}</label>
                    <input type="text" id="groupSuffix" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;" 
                           placeholder="${t('providers.addGroup.suffixPlaceholder')}" data-i18n-placeholder="providers.addGroup.suffixPlaceholder">
                    <small style="color: #666; font-size: 12px; margin-top: 5px; display: block;">
                        Example: ${selectedConfig?.id || 'openai-custom'} + prod -> ${selectedConfig?.id || 'openai-custom'}-prod
                    </small>
                </div>
            </div>
            <div class="modal-footer" style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;">
                <button class="btn btn-secondary modal-cancel" data-i18n="modal.provider.cancel">${t('modal.provider.cancel')}</button>
                <button class="btn btn-primary modal-submit">
                    <i class="fas fa-check"></i> <span data-i18n="common.confirm">${t('common.confirm')}</span>
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    const closeBtn = modal.querySelector('.modal-close');
    const cancelBtn = modal.querySelector('.modal-cancel');
    const submitBtn = modal.querySelector('.modal-submit');
    const suffixInput = modal.querySelector('#groupSuffix');
    const baseTypeSelect = modal.querySelector('#groupBaseType');

    const closeModal = () => modal.remove();
    
    [closeBtn, cancelBtn].forEach(btn => btn.addEventListener('click', closeModal));
    
    submitBtn.addEventListener('click', async () => {
        const baseType = baseTypeSelect.value;
        const suffix = suffixInput.value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
        
        if (!suffix) {
            showToast(t('common.warning'), t('common.invalidSuffix'), 'warning');
            return;
        }
        
        const newProviderType = `${baseType}-${suffix}`;
        
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        
        try {
            // Create a new provider group with suffix and add an initial empty config
            // Create a temporary empty config so the group shows up in the dashboard
            const response = await window.apiClient.post('/providers', {
                providerType: newProviderType,
                providerConfig: {
                    customName: suffix.toUpperCase(),
                    isHealthy: true,
                    isDisabled: false,
                    usageCount: 0,
                    errorCount: 0
                }
            });
            
            if (response.success) {
                showToast(t('common.success'), t('providers.addGroup.success'), 'success');
                closeModal();
                // Reload provider list, force refresh supported types
                await loadProviders(true);
                // Auto-open management interface for the newly created group
                setTimeout(() => openProviderManager(newProviderType), 500);
            } else {
                throw new Error(response.error?.message || 'Unknown error');
            }
        } catch (error) {
            console.error('Failed to add provider group:', error);
            showToast(t('common.error'), t('providers.addGroup.error') + ': ' + error.message, 'error');
            submitBtn.disabled = false;
            submitBtn.innerHTML = `<i class="fas fa-check"></i> <span>${t('common.confirm')}</span>`;
        }
    });
}

export {
    loadSystemInfo,
    updateTimeDisplay,
    loadProviders,
    openProviderManager,
    showAuthModal,
    executeGenerateAuthUrl,
    handleGenerateAuthUrl,
    checkUpdate,
    performUpdate,
    showAddProviderGroupModal
};
