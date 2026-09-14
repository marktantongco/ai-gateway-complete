// Modal management module

import { escapeHtml, showToast, getFieldLabel, getProviderTypeFields } from './utils.js';
import { handleProviderPasswordToggle } from './event-handlers.js';
import { t } from './i18n.js';

const MANAGED_MODEL_LIST_PROVIDERS = new Set(['openai-custom', 'openaiResponses-custom', 'claude-custom']);

// Pagination configuration
const PROVIDERS_PER_PAGE = 5;
let currentPage = 1;
let currentProviders = [];
let currentProviderType = '';
let nodeSearchTerm = '';
let currentViewMode = localStorage.getItem('providerViewMode') || 'list';

function usesManagedModelList(providerType = '') {
    return Array.from(MANAGED_MODEL_LIST_PROVIDERS).some(baseType =>
        providerType === baseType || providerType.startsWith(`${baseType}-`)
    );
}

function normalizeModelList(models = []) {
    return [...new Set(
        (Array.isArray(models) ? models : [])
            .filter(model => typeof model === 'string')
            .map(model => model.trim())
            .filter(Boolean)
    )].sort((a, b) => a.localeCompare(b));
}

function serializeModelsData(models = []) {
    return encodeURIComponent(JSON.stringify(normalizeModelList(models)));
}

function parseModelsData(rawValue = '') {
    if (!rawValue) {
        return [];
    }

    try {
        return normalizeModelList(JSON.parse(decodeURIComponent(rawValue)));
    } catch (error) {
        console.warn('Failed to parse models data:', error);
        return [];
    }
}

function renderSupportedModelsValue(models = []) {
    const selectedModels = normalizeModelList(models);
    if (selectedModels.length === 0) {
        return `<div class="supported-models-empty">${escapeHtml(t('modal.provider.supportedModelsEmpty'))}</div>`;
    }

    return `
        <div class="supported-models-list">
            ${selectedModels.map(model => `
                <span class="supported-model-tag" title="${escapeHtml(model)}">${escapeHtml(model)}</span>
            `).join('')}
        </div>
    `;
}

function getSupportedModelsContainer(uuid) {
    return document.querySelector(`.supported-models-container[data-uuid="${uuid}"]`);
}

function setSupportedModelsSelection(uuid, models, options = {}) {
    const container = getSupportedModelsContainer(uuid);
    if (!container) return;

    const normalizedModels = normalizeModelList(models);
    const encodedModels = serializeModelsData(normalizedModels);
    container.dataset.selectedModels = encodedModels;

    if (options.updateOriginal) {
        container.dataset.originalModels = encodedModels;
    }

    const valueContainer = container.querySelector('.supported-models-values');
    if (valueContainer) {
        valueContainer.innerHTML = renderSupportedModelsValue(normalizedModels);
    }

    const summary = container.querySelector('.supported-models-summary');
    if (summary) {
        summary.textContent = t('modal.provider.modelPickerSelected', { count: normalizedModels.length });
    }
}

function resetSupportedModelsSelection(uuid) {
    const container = getSupportedModelsContainer(uuid);
    if (!container) return;
    setSupportedModelsSelection(uuid, parseModelsData(container.dataset.originalModels || ''));
}

function renderSupportedModelsSection(provider) {
    const selectedModels = normalizeModelList(provider.supportedModels || []);
    const encodedModels = serializeModelsData(selectedModels);

    return `
        <div class="config-item supported-models-section">
            <label>
                <i class="fas fa-layer-group"></i> <span data-i18n="modal.provider.supportedModels">${t('modal.provider.supportedModels')}</span>
                <span class="help-text" data-i18n="modal.provider.supportedModelsHelp">${t('modal.provider.supportedModelsHelp')}</span>
            </label>
            <div class="supported-models-container"
                 data-uuid="${provider.uuid}"
                 data-selected-models="${encodedModels}"
                 data-original-models="${encodedModels}">
                <div class="supported-models-toolbar">
                    <span class="supported-models-summary">${escapeHtml(t('modal.provider.modelPickerSelected', { count: selectedModels.length }))}</span>
                    <button type="button"
                            class="btn btn-outline detect-models-btn"
                            onclick="window.openSupportedModelsPicker('${currentProviderType}', '${provider.uuid}', event)"
                            disabled>
                        <i class="fas fa-wand-magic-sparkles"></i>
                        <span data-i18n="modal.provider.detectModels">${t('modal.provider.detectModels')}</span>
                    </button>
                </div>
                <div class="supported-models-values">
                    ${renderSupportedModelsValue(selectedModels)}
                </div>
            </div>
        </div>
    `;
}

function collectDraftProviderConfig(providerDetail, providerType, uuid) {
    const configInputs = providerDetail.querySelectorAll('input[data-config-key]');
    const configSelects = providerDetail.querySelectorAll('select[data-config-key]');
    const providerConfig = {};

    configInputs.forEach(input => {
        const key = input.dataset.configKey;
        let value = input.value;
        if (key === 'concurrencyLimit' || key === 'queueLimit') {
            value = parseInt(value || '0', 10);
        }
        providerConfig[key] = value;
    });

    configSelects.forEach(select => {
        const key = select.dataset.configKey;
        providerConfig[key] = select.value === 'true';
    });

    if (usesManagedModelList(providerType)) {
        const supportedModels = parseModelsData(getSupportedModelsContainer(uuid)?.dataset.selectedModels || '');
        providerConfig.supportedModels = supportedModels;
        providerConfig.notSupportedModels = [];
    } else {
        const modelCheckboxes = providerDetail.querySelectorAll(`.model-checkbox[data-uuid="${uuid}"]:checked`);
        providerConfig.notSupportedModels = Array.from(modelCheckboxes).map(checkbox => checkbox.value);
    }

    return providerConfig;
}
let cachedModels = []; // Cache model list

function closeSupportedModelsPicker(overlay) {
    if (!overlay) return;

    if (overlay.escapeHandler) {
        document.removeEventListener('keydown', overlay.escapeHandler);
    }

    overlay.remove();
}

function showSupportedModelsPickerModal(providerType, uuid, detectedModels, currentSelectedModels = []) {
    const existingOverlay = document.querySelector('.provider-model-picker-overlay');
    if (existingOverlay) {
        closeSupportedModelsPicker(existingOverlay);
    }

    const allModels = normalizeModelList([...detectedModels, ...currentSelectedModels]);
    const selectedModels = new Set(normalizeModelList(currentSelectedModels));
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay provider-model-picker-overlay';
    overlay.style.display = 'flex';
    overlay.innerHTML = `
        <div class="modal-content provider-model-picker-modal">
            <div class="modal-header">
                <h3>
                    <i class="fas fa-cubes"></i>
                    ${escapeHtml(t('modal.provider.modelPickerTitle', { type: providerType }))}
                </h3>
                <button class="modal-close" type="button" aria-label="${escapeHtml(t('common.close'))}">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="modal-body">
                <div class="provider-model-picker-toolbar">
                    <input type="search"
                           class="provider-model-picker-search"
                           placeholder="${escapeHtml(t('modal.provider.modelPickerSearchPlaceholder'))}">
                    <label class="provider-model-picker-select-all">
                        <input type="checkbox" class="provider-model-picker-select-all-input">
                        <span>${escapeHtml(t('modal.provider.modelPickerSelectAll'))}</span>
                    </label>
                    <button type="button" class="btn btn-secondary provider-model-picker-clear">
                        ${escapeHtml(t('modal.provider.modelPickerClearAll'))}
                    </button>
                </div>
                <div class="provider-model-picker-summary"></div>
                <div class="provider-model-picker-list"></div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary provider-model-picker-cancel">
                    ${escapeHtml(t('common.cancel'))}
                </button>
                <button type="button" class="btn btn-primary provider-model-picker-confirm">
                    ${escapeHtml(t('common.confirm'))}
                </button>
            </div>
        </div>
    `;

    const searchInput = overlay.querySelector('.provider-model-picker-search');
    const listContainer = overlay.querySelector('.provider-model-picker-list');
    const summary = overlay.querySelector('.provider-model-picker-summary');
    const selectAllInput = overlay.querySelector('.provider-model-picker-select-all-input');
    const clearButton = overlay.querySelector('.provider-model-picker-clear');
    const cancelButton = overlay.querySelector('.provider-model-picker-cancel');
    const confirmButton = overlay.querySelector('.provider-model-picker-confirm');
    const closeButton = overlay.querySelector('.modal-close');

    const getVisibleModels = () => {
        const keyword = searchInput.value.trim().toLowerCase();
        if (!keyword) {
            return allModels;
        }

        return allModels.filter(model => model.toLowerCase().includes(keyword));
    };

    const updateSelectAllState = () => {
        const visibleModels = getVisibleModels();
        if (visibleModels.length === 0) {
            selectAllInput.checked = false;
            selectAllInput.indeterminate = false;
            selectAllInput.disabled = true;
            return;
        }

        selectAllInput.disabled = false;
        const checkedCount = visibleModels.filter(model => selectedModels.has(model)).length;
        selectAllInput.checked = checkedCount === visibleModels.length;
        selectAllInput.indeterminate = checkedCount > 0 && checkedCount < visibleModels.length;
    };

    const updateSummary = () => {
        summary.textContent = t('modal.provider.modelPickerSelected', { count: selectedModels.size });
    };

    const renderList = () => {
        const visibleModels = getVisibleModels();

        if (visibleModels.length === 0) {
            listContainer.innerHTML = `
                <div class="provider-model-picker-empty">
                    ${escapeHtml(allModels.length === 0 ? t('modal.provider.detectModelsNoResults') : t('modal.provider.supportedModelsEmpty'))}
                </div>
            `;
            updateSelectAllState();
            updateSummary();
            return;
        }

        listContainer.innerHTML = visibleModels.map(model => `
            <label class="provider-model-picker-item">
                <input type="checkbox"
                       value="${escapeHtml(model)}"
                       ${selectedModels.has(model) ? 'checked' : ''}>
                <span>${escapeHtml(model)}</span>
            </label>
        `).join('');

        listContainer.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                if (checkbox.checked) {
                    selectedModels.add(checkbox.value);
                } else {
                    selectedModels.delete(checkbox.value);
                }
                updateSelectAllState();
                updateSummary();
            });
        });

        updateSelectAllState();
        updateSummary();
    };

    const handleClose = () => closeSupportedModelsPicker(overlay);

    overlay.escapeHandler = event => {
        if (event.key === 'Escape') {
            handleClose();
        }
    };

    document.addEventListener('keydown', overlay.escapeHandler);
    overlay.addEventListener('click', event => {
        if (event.target === overlay) {
            handleClose();
        }
    });

    searchInput.addEventListener('input', renderList);
    selectAllInput.addEventListener('change', () => {
        const visibleModels = getVisibleModels();
        visibleModels.forEach(model => {
            if (selectAllInput.checked) {
                selectedModels.add(model);
            } else {
                selectedModels.delete(model);
            }
        });
        renderList();
    });
    clearButton.addEventListener('click', () => {
        selectedModels.clear();
        renderList();
    });
    cancelButton.addEventListener('click', handleClose);
    closeButton.addEventListener('click', handleClose);
    confirmButton.addEventListener('click', () => {
        setSupportedModelsSelection(uuid, Array.from(selectedModels));
        handleClose();
    });

    document.body.appendChild(overlay);
    renderList();
    searchInput.focus();
}

async function openSupportedModelsPicker(providerType, uuid, event) {
    event.stopPropagation();

    if (!usesManagedModelList(providerType)) {
        return;
    }

    const providerDetail = event.target.closest('.provider-item-detail, .provider-item-card');
    if (!providerDetail) {
        return;
    }

    const detectButton = providerDetail.querySelector('.detect-models-btn');
    const originalHtml = detectButton?.innerHTML;
    const draftProviderConfig = collectDraftProviderConfig(providerDetail, providerType, uuid);

    try {
        if (detectButton) {
            detectButton.disabled = true;
            detectButton.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${escapeHtml(t('common.loading'))}`;
        }

        const response = await window.apiClient.post(
            `/providers/${encodeURIComponent(providerType)}/${uuid}/detect-models`,
            { providerConfig: draftProviderConfig }
        );

        showSupportedModelsPickerModal(
            providerType,
            uuid,
            response.models || [],
            draftProviderConfig.supportedModels || response.selectedModels || []
        );
    } catch (error) {
        console.error('Failed to detect provider models:', error);
        showToast(t('common.error'), t('modal.provider.detectModelsFailed') + ': ' + error.message, 'error');
    } finally {
        if (detectButton) {
            detectButton.innerHTML = originalHtml;
            detectButton.disabled = !providerDetail.classList.contains('editing');
        }
    }
}

/**
 * Show provider management modal
 * @param {Object} data - Provider data
 * @param {string} initialSearchTerm - Initial search term
 */
function showProviderManagerModal(data, initialSearchTerm = '') {
    const { providerType, providers, totalCount, healthyCount } = data;
    
    // Save current data for pagination
    currentProviders = providers;
    currentProviderType = providerType;
    currentPage = 1;
    nodeSearchTerm = initialSearchTerm;
    cachedModels = [];
    
    // Remove existing modal
    const existingModal = document.querySelector('.provider-modal');
    if (existingModal) {
        // Clean up event listeners
        if (existingModal.cleanup) {
            existingModal.cleanup();
        }
        existingModal.remove();
    }
    
    const totalPages = Math.ceil(providers.length / PROVIDERS_PER_PAGE);
    
    // Create modal
    const modal = document.createElement('div');
    modal.className = 'provider-modal';
    modal.setAttribute('data-provider-type', providerType);
    modal.innerHTML = `
        <div class="provider-modal-content">
            <div class="provider-modal-header">
                <h3 data-i18n="modal.provider.manage" data-i18n-params='{"type":"${providerType}"}'><i class="fas fa-cogs"></i> Manage ${providerType} Provider Configuration</h3>
                <button class="modal-close" onclick="window.closeProviderModal(this)">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="provider-modal-body">
                <div class="provider-summary">
                    <div class="provider-summary-item">
                        <span class="label" data-i18n="modal.provider.totalAccounts">Total Accounts:</span>
                        <span class="value">${totalCount}</span>
                    </div>
                    <div class="provider-summary-item">
                        <span class="label" data-i18n="modal.provider.healthyAccounts">Healthy Accounts:</span>
                        <span class="value">${healthyCount}</span>
                    </div>
                    <div class="provider-summary-actions">
                        <button class="btn btn-success" onclick="window.showAddProviderForm('${providerType}')">
                            <i class="fas fa-plus"></i> <span data-i18n="modal.provider.add">Add New Provider</span>
                        </button>
                        <button class="btn btn-warning" onclick="window.resetAllProvidersHealth('${providerType}')" data-i18n="modal.provider.resetHealth" title="Reset health status of all nodes to healthy">
                            <i class="fas fa-heartbeat"></i> Reset to Healthy
                        </button>
                        <button class="btn btn-info" onclick="window.performHealthCheck('${providerType}')" data-i18n="modal.provider.healthCheck" title="Perform health check on unhealthy nodes">
                            <i class="fas fa-stethoscope"></i> Check Unhealthy
                        </button>
                        <button class="btn btn-secondary" onclick="window.refreshUnhealthyUuids('${providerType}')" data-i18n="modal.provider.refreshUnhealthyUuids" title="Refresh UUIDs of unhealthy nodes">
                            <i class="fas fa-sync-alt"></i> <span data-i18n="modal.provider.refreshUnhealthyUuidsBtn">Refresh UUID</span>
                        </button>
                        <button class="btn btn-danger" onclick="window.deleteUnhealthyProviders('${providerType}')" data-i18n="modal.provider.deleteUnhealthy" title="Delete Unhealthy Nodes">
                            <i class="fas fa-trash-alt"></i> <span data-i18n="modal.provider.deleteUnhealthyBtn">Delete Unhealthy</span>
                        </button>
                    </div>
                </div>

                <div class="provider-nodes-toolbar" style="margin-bottom: 15px; display: flex; gap: 10px; align-items: center;">
                    <div class="search-input-wrapper" style="position: relative; flex: 1;">
                        <i class="fas fa-search" style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--text-tertiary);"></i>
                        <input type="text" id="nodeSearchInput" 
                               value="${escapeHtml(nodeSearchTerm)}"
                               placeholder="${t('modal.provider.searchNodesPlaceholder') || 'Search node name, UUID or config content...'}" 
                               style="width: 100%; padding: 10px 12px 10px 35px; border-radius: 8px; border: 1px solid var(--border-color); background: var(--bg-primary); color: var(--text-primary);">
                    </div>
                    <div class="view-mode-toggle" style="display: flex; background: var(--bg-secondary); padding: 4px; border-radius: 8px; border: 1px solid var(--border-color);">
                        <button class="view-mode-btn ${currentViewMode === 'list' ? 'active' : ''}" data-mode="list" title="${t('common.view.list') || 'List View'}" style="border: none; background: ${currentViewMode === 'list' ? 'var(--primary-color)' : 'transparent'}; color: ${currentViewMode === 'list' ? '#fff' : 'var(--text-secondary)'}; padding: 6px 10px; border-radius: 6px; cursor: pointer; transition: all 0.2s;">
                            <i class="fas fa-list"></i>
                        </button>
                        <button class="view-mode-btn ${currentViewMode === 'card' ? 'active' : ''}" data-mode="card" title="${t('common.view.card') || 'Card View'}" style="border: none; background: ${currentViewMode === 'card' ? 'var(--primary-color)' : 'transparent'}; color: ${currentViewMode === 'card' ? '#fff' : 'var(--text-secondary)'}; padding: 6px 10px; border-radius: 6px; cursor: pointer; transition: all 0.2s;">
                            <i class="fas fa-th-large"></i>
                        </button>
                    </div>
                </div>
                
                <div id="paginationTop"></div>
                <div class="provider-list" id="providerList"></div>
                <div id="paginationBottom"></div>
            </div>
        </div>
    `;
    
    // Add to page
    document.body.appendChild(modal);
    
    // Add modal event listeners
    addModalEventListeners(modal);
    
    // Initial render
    window.goToProviderPage(1);
}

/**
 * Render pagination controls
 * @param {number} currentPage - Current page
 * @param {number} totalPages - Total pages
 * @param {number} totalItems - Total items
 * @param {string} position - Position identifier (top/bottom)
 * @returns {string} HTML string
 */
function renderPagination(page, totalPages, totalItems, position = 'top') {
    if (totalPages <= 1 || currentViewMode === 'card') {
        return `<div class="pagination-container" data-position="${position}"></div>`;
    }
    
    const startItem = (page - 1) * PROVIDERS_PER_PAGE + 1;
    const endItem = Math.min(page * PROVIDERS_PER_PAGE, totalItems);
    
    let pageButtons = '';
    const maxVisiblePages = 5;
    let startPage = Math.max(1, page - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
    
    if (endPage - startPage + 1 < maxVisiblePages) {
        startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }
    
    if (startPage > 1) {
        pageButtons += `<button class="page-btn" onclick="window.goToProviderPage(1)">1</button>`;
        if (startPage > 2) {
            pageButtons += `<span class="page-ellipsis">...</span>`;
        }
    }
    
    for (let i = startPage; i <= endPage; i++) {
        pageButtons += `<button class="page-btn ${i === page ? 'active' : ''}" onclick="window.goToProviderPage(${i})">${i}</button>`;
    }
    
    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            pageButtons += `<span class="page-ellipsis">...</span>`;
        }
        pageButtons += `<button class="page-btn" onclick="window.goToProviderPage(${totalPages})">${totalPages}</button>`;
    }
    
    return `
        <div class="pagination-container ${position}" data-position="${position}">
            <div class="pagination-info">
                <span data-i18n="pagination.showing" data-i18n-params='{"start":"${startItem}","end":"${endItem}","total":"${totalItems}"}'>Showing ${startItem}-${endItem} / ${totalItems} total</span>
            </div>
            <div class="pagination-controls">
                <button class="page-btn nav-btn" onclick="window.goToProviderPage(${page - 1})" ${page <= 1 ? 'disabled' : ''}>
                    <i class="fas fa-chevron-left"></i>
                </button>
                ${pageButtons}
                <button class="page-btn nav-btn" onclick="window.goToProviderPage(${page + 1})" ${page >= totalPages ? 'disabled' : ''}>
                    <i class="fas fa-chevron-right"></i>
                </button>
            </div>
            <div class="pagination-jump">
                <span data-i18n="pagination.jumpTo">Jump to</span>
                <input type="number" min="1" max="${totalPages}" value="${page}"
                       onkeypress="if(event.key==='Enter')window.goToProviderPage(parseInt(this.value))"
                       class="page-jump-input">
                <span data-i18n="pagination.page">page</span>
            </div>
        </div>
    `;
}

/**
 * Get filtered provider list
 */
function getFilteredProviders() {
    if (!nodeSearchTerm) return currentProviders;
    const term = nodeSearchTerm.toLowerCase().trim();
    return currentProviders.filter(p => {
        // Search fields: custom name, UUID, API Key, Base URL, OAuth path, etc.
        const searchFields = [
            p.customName,
            p.uuid,
            p.OPENAI_API_KEY,
            p.OPENAI_BASE_URL,
            p.CLAUDE_API_KEY,
            p.CLAUDE_BASE_URL,
            p.GEMINI_OAUTH_CREDS_FILE_PATH,
            p.KIRO_OAUTH_CREDS_FILE_PATH,
            p.QWEN_OAUTH_CREDS_FILE_PATH,
            p.ANTIGRAVITY_OAUTH_CREDS_FILE_PATH,
            p.IFLOW_OAUTH_CREDS_FILE_PATH,
            p.CODEX_OAUTH_CREDS_FILE_PATH,
            p.GROK_COOKIE_TOKEN,
            p.FORWARD_API_KEY,
            p.checkModelName
        ];
        
        return searchFields.some(field => 
            field && String(field).toLowerCase().includes(term)
        );
    });
}

/**
 * Go to specified page
 * @param {number} page - Target page number
 */
function goToProviderPage(page) {
    const filteredProviders = getFilteredProviders();
    const totalPages = Math.ceil(filteredProviders.length / PROVIDERS_PER_PAGE);
    
    // Validate page range
    if (page < 1) page = 1;
    if (page > totalPages && totalPages > 0) page = totalPages;
    if (totalPages === 0) page = 1;
    
    currentPage = page;
    
    // Update provider list
    const providerList = document.getElementById('providerList');
    if (providerList) {
        providerList.innerHTML = renderProviderListPaginated(filteredProviders, page);
    }
    
    // Update pagination controls
    const paginationTop = document.getElementById('paginationTop');
    const paginationBottom = document.getElementById('paginationBottom');
    
    if (paginationTop) {
        paginationTop.innerHTML = totalPages > 1 ? renderPagination(page, totalPages, filteredProviders.length) : '';
    }
    if (paginationBottom) {
        paginationBottom.innerHTML = totalPages > 1 ? renderPagination(page, totalPages, filteredProviders.length, 'bottom') : '';
    }
    
    // Scroll to top
    const modalBody = document.querySelector('.provider-modal-body');
    if (modalBody) {
        modalBody.scrollTop = 0;
    }
    
    // Load model list for current page providers
    const startIndex = (page - 1) * PROVIDERS_PER_PAGE;
    const endIndex = Math.min(startIndex + PROVIDERS_PER_PAGE, filteredProviders.length);
    const pageProviders = filteredProviders.slice(startIndex, endIndex);
    
    // If model list is cached, use directly
    if (!usesManagedModelList(currentProviderType) && cachedModels.length > 0) {
        pageProviders.forEach(provider => {
            renderNotSupportedModelsSelector(provider.uuid, cachedModels, provider.notSupportedModels || []);
        });
    } else if (!usesManagedModelList(currentProviderType)) {
        loadModelsForProviderType(currentProviderType, pageProviders);
    }
}

/**
 * Render paginated provider list
 * @param {Array} providers - Provider array
 * @param {number} page - Current page
 * @returns {string} HTML string
 */
function renderProviderListPaginated(providers, page) {
    if (providers.length === 0) {
        return `
            <div class="no-providers">
                <i class="fas fa-search" style="font-size: 2rem; opacity: 0.3; display: block; margin-bottom: 1rem;"></i>
                <p>${t('common.noResults') || 'No matching nodes found'}</p>
            </div>
        `;
    }

    // If card mode, show all nodes without pagination
    if (currentViewMode === 'card') {
        return renderProviderList(providers);
    }

    const startIndex = (page - 1) * PROVIDERS_PER_PAGE;
    const endIndex = Math.min(startIndex + PROVIDERS_PER_PAGE, providers.length);
    const pageProviders = providers.slice(startIndex, endIndex);
    
    return renderProviderList(pageProviders);
}

/**
 * Load model list for provider type (optimized: single API call, cached)
 * @param {string} providerType - Provider type
 * @param {Array} providers - Provider list
 */
async function loadModelsForProviderType(providerType, providers) {
    try {
        if (usesManagedModelList(providerType)) {
            return;
        }

        // If cache exists, use directly
        if (cachedModels.length > 0) {
            providers.forEach(provider => {
                renderNotSupportedModelsSelector(provider.uuid, cachedModels, provider.notSupportedModels || []);
            });
            return;
        }
        
        // Call API only once to get model list
        const response = await window.apiClient.get(`/provider-models/${encodeURIComponent(providerType)}`);
        const models = response.models || [];
        
        // Cache model list
        cachedModels = models;
        
        // Render model selector for each provider
        providers.forEach(provider => {
            renderNotSupportedModelsSelector(provider.uuid, models, provider.notSupportedModels || []);
        });
    } catch (error) {
        console.error('Failed to load models for provider type:', error);
        // If load fails, show error for each provider
        providers.forEach(provider => {
            const container = document.querySelector(`.not-supported-models-container[data-uuid="${provider.uuid}"]`);
            if (container) {
                container.innerHTML = `<div class="error-message">${t('common.error')}: Failed to load model list</div>`;
            }
        });
    }
}

/**
 * Add event listeners to modal
 * @param {HTMLElement} modal - Modal element
 */
function addModalEventListeners(modal) {
    // ESC key closes modal
    const handleEscKey = (event) => {
        if (event.key === 'Escape') {
            modal.remove();
            document.removeEventListener('keydown', handleEscKey);
        }
    };
    
    // Click background to close modal
    const handleBackgroundClick = (event) => {
        if (event.target === modal) {
            // Check if any node is being edited
            const editingProvider = modal.querySelector('.provider-item-detail.editing, .provider-item-card.editing');
            if (editingProvider) {
                // showToast(t('common.warning'), 'Please save or cancel edit first', 'warning');
                return;
            }
            // Check if there's an add form
            const addForm = modal.querySelector('.add-provider-form');
            if (addForm) {
                // showToast(t('common.warning'), 'Please save or cancel add first', 'warning');
                return;
            }
            modal.remove();
            document.removeEventListener('keydown', handleEscKey);
        }
    };
    
    // Prevent modal from closing when content area is clicked
    const modalContent = modal.querySelector('.provider-modal-content');
    const handleContentClick = (event) => {
        event.stopPropagation();
    };
    
    // Password toggle button event handler
    const handlePasswordToggleClick = (event) => {
        const button = event.target.closest('.password-toggle');
        if (button) {
            event.preventDefault();
            event.stopPropagation();
            handleProviderPasswordToggle(button);
        }
    };
    
    // Upload button event handler
    const handleUploadButtonClick = (event) => {
        const button = event.target.closest('.upload-btn');
        if (button) {
            event.preventDefault();
            event.stopPropagation();
            const targetInputId = button.getAttribute('data-target');
            const providerType = modal.getAttribute('data-provider-type');
            if (targetInputId && window.fileUploadHandler) {
                window.fileUploadHandler.handleFileUpload(button, targetInputId, providerType);
            }
        }
    };

    // Node search event handler
    const searchInput = modal.querySelector('#nodeSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            nodeSearchTerm = e.target.value;
            window.goToProviderPage(1); // Reset to first page when searching
        });
    }

    // View mode switch event handler
    const viewModeBtns = modal.querySelectorAll('.view-mode-btn');
    viewModeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const mode = btn.dataset.mode;
            if (mode === currentViewMode) return;

            currentViewMode = mode;
            localStorage.setItem('providerViewMode', mode);

            // Update button state
            viewModeBtns.forEach(b => {
                const isActive = b.dataset.mode === mode;
                b.classList.toggle('active', isActive);
                b.style.background = isActive ? 'var(--primary-color)' : 'transparent';
                b.style.color = isActive ? '#fff' : 'var(--text-secondary)';
            });

            // Re-render current page
            window.goToProviderPage(currentPage);
        });
    });
    
    // Add event listeners
    document.addEventListener('keydown', handleEscKey);
    modal.addEventListener('click', handleBackgroundClick);
    if (modalContent) {
        modalContent.addEventListener('click', handleContentClick);
        modalContent.addEventListener('click', handlePasswordToggleClick);
        modalContent.addEventListener('click', handleUploadButtonClick);
    }
    
    // Cleanup function, called when modal closes
    modal.cleanup = () => {
        document.removeEventListener('keydown', handleEscKey);
        modal.removeEventListener('click', handleBackgroundClick);
        if (modalContent) {
            modalContent.removeEventListener('click', handleContentClick);
            modalContent.removeEventListener('click', handlePasswordToggleClick);
            modalContent.removeEventListener('click', handleUploadButtonClick);
        }
    };
}

/**
 * Close modal and clean up event listeners
 * @param {HTMLElement} button - Close button
 */
function closeProviderModal(button) {
    const modal = button.closest('.provider-modal');
    if (modal) {
        if (modal.cleanup) {
            modal.cleanup();
        }
        modal.remove();
    }
}

/**
 * Render provider list (detail mode)
 * @param {Array} providers - Provider array
 * @returns {string} HTML string
 */
function renderProviderDetailList(providers) {
    return providers.map(provider => {
        const isHealthy = provider.isHealthy;
        const isDisabled = provider.isDisabled || false;
        const lastUsed = provider.lastUsed ? new Date(provider.lastUsed).toLocaleString() : t('modal.provider.neverUsed');
        const lastHealthCheckTime = provider.lastHealthCheckTime ? new Date(provider.lastHealthCheckTime).toLocaleString() : t('modal.provider.neverChecked');
        const lastHealthCheckModel = provider.lastHealthCheckModel || '-';
        const healthClass = isHealthy ? 'healthy' : 'unhealthy';
        const disabledClass = isDisabled ? 'disabled' : '';
        const healthIcon = isHealthy ? 'fas fa-check-circle text-success' : 'fas fa-exclamation-triangle text-warning';
        const healthText = isHealthy ? t('modal.provider.status.healthy') : t('modal.provider.status.unhealthy');
        const disabledText = isDisabled ? t('modal.provider.status.disabled') : t('modal.provider.status.enabled');
        const disabledIcon = isDisabled ? 'fas fa-ban text-muted' : 'fas fa-play text-success';
        const toggleButtonText = isDisabled ? t('modal.provider.enabled') : t('modal.provider.disabled');
        const toggleButtonIcon = isDisabled ? 'fas fa-play' : 'fas fa-ban';
        const toggleButtonClass = isDisabled ? 'btn-success' : 'btn-warning';
        const needsRefresh = !!provider.needsRefresh;
        
        // Build error info display
        let errorInfoHtml = '';
        if (!isHealthy && provider.lastErrorMessage) {
            const escapedErrorMsg = provider.lastErrorMessage.replace(/</g, '&lt;').replace(/>/g, '&gt;');
            errorInfoHtml = `
                <div class="provider-error-info">
                    <i class="fas fa-exclamation-circle text-danger"></i>
                    <span class="error-label" data-i18n="modal.provider.lastError">Last Error:</span>
                    <span class="error-message" title="${escapedErrorMsg}">${escapedErrorMsg}</span>
                </div>
            `;
        }
        
        return `
            <div class="provider-item-detail ${healthClass} ${disabledClass}" data-uuid="${provider.uuid}">
                <div class="provider-item-header" onclick="window.toggleProviderDetails('${provider.uuid}')">
                    <div class="provider-info">
                        <div class="provider-name">
                            ${provider.customName || provider.uuid}
                            ${needsRefresh ? `<span class="badge badge-warning" style="font-size: 10px; margin-left: 8px; vertical-align: middle;"><i class="fas fa-sync-alt fa-spin"></i> <span data-i18n="providers.status.needsRefresh">${t('providers.status.needsRefresh')}</span></span>` : ''}
                        </div>
                        <div class="provider-meta">
                            <span class="health-status">
                                <i class="${healthIcon}"></i>
                                <span data-i18n="modal.provider.healthCheckLabel">Health Status</span>: <span data-i18n="${isHealthy ? 'modal.provider.status.healthy' : 'modal.provider.status.unhealthy'}">${healthText}</span>
                            </span> |
                            <span class="disabled-status">
                                <i class="${disabledIcon}"></i>
                                <span data-i18n="upload.detail.status">Status</span>: <span data-i18n="${isDisabled ? 'modal.provider.status.disabled' : 'modal.provider.status.enabled'}">${disabledText}</span>
                            </span> |
                            <span data-i18n="modal.provider.usageCount">Usage Count</span>: ${provider.usageCount || 0} |
                            <span data-i18n="modal.provider.errorCount">Error Count</span>: ${provider.errorCount || 0} |
                            <span data-i18n="modal.provider.lastUsed">Last Used</span>: ${lastUsed}
                        </div>
                        <div class="provider-health-meta">
                            <span class="health-check-time">
                                <i class="fas fa-clock"></i>
                                <span data-i18n="modal.provider.lastCheck">Last Check</span>: ${lastHealthCheckTime}
                            </span> |
                            <span class="health-check-model">
                                <i class="fas fa-cube"></i>
                                <span data-i18n="modal.provider.checkModel">Check Model</span>: ${lastHealthCheckModel}
                            </span>
                        </div>
                        ${errorInfoHtml}
                    </div>
                    <div class="provider-actions-group">
                        <button class="btn-small ${toggleButtonClass}" onclick="window.toggleProviderStatus('${provider.uuid}', event)" title="${toggleButtonText}this provider">
                            <i class="${toggleButtonIcon}"></i> ${toggleButtonText}
                        </button>
                        <button class="btn-small btn-edit" onclick="window.editProvider('${provider.uuid}', event)">
                            <i class="fas fa-edit"></i> <span data-i18n="modal.provider.edit">Edit</span>
                        </button>
                        <button class="btn-small btn-info btn-provider-health-check" onclick="window.performSingleHealthCheck('${provider.uuid}', event)" title="${t('modal.provider.healthCheckCurrentTitle')}">
                            <i class="fas fa-stethoscope"></i> <span data-i18n="modal.provider.healthCheck">${t('modal.provider.healthCheck')}</span>
                        </button>
                        <button class="btn-small btn-delete" onclick="window.deleteProvider('${provider.uuid}', event)">
                            <i class="fas fa-trash"></i> <span data-i18n="modal.provider.delete">Delete</span>
                        </button>
                        <button class="btn-small btn-refresh-uuid" onclick="window.refreshProviderUuid('${provider.uuid}', event)" title="${t('modal.provider.refreshUuid')}">
                            <i class="fas fa-sync-alt"></i>
                        </button>
                    </div>
                </div>
                <div class="provider-item-content" id="content-${provider.uuid}">
                    <div class="">
                        ${renderProviderConfig(provider)}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Render provider list (card mode)
 * @param {Array} providers - Provider array
 * @returns {string} HTML string
 */
function renderProviderCardList(providers) {
    let html = '<div class="provider-cards-grid">';
    html += providers.map(provider => {
        const isHealthy = provider.isHealthy;
        const isDisabled = provider.isDisabled || false;
        const healthClass = isHealthy ? 'healthy' : 'unhealthy';
        const disabledClass = isDisabled ? 'disabled' : '';
        const displayName = provider.customName || provider.uuid;
        const needsRefresh = !!provider.needsRefresh;
        const toggleButtonText = isDisabled ? t('modal.provider.enabled') : t('modal.provider.disabled');
        const toggleButtonIcon = isDisabled ? 'fas fa-play' : 'fas fa-ban';
        const toggleButtonClass = isDisabled ? 'btn-success' : 'btn-warning';

        return `
            <div class="provider-item-card ${healthClass} ${disabledClass}" data-uuid="${provider.uuid}" onclick="window.toggleProviderDetails('${provider.uuid}')">
                <div class="card-header">
                    <div class="card-status-dot"></div>
                    <div class="card-name" title="${displayName}">${displayName}</div>
                    ${needsRefresh ? '<i class="fas fa-sync-alt fa-spin card-refresh-icon"></i>' : ''}
                </div>
                <div class="card-body">
                    <div class="card-stat" title="${t('modal.provider.usageCount')}: ${provider.usageCount || 0}">
                        <i class="fas fa-paper-plane"></i>
                        <span>${provider.usageCount || 0}</span>
                    </div>
                    <div class="card-stat" title="${t('modal.provider.errorCount')}: ${provider.errorCount || 0}">
                        <i class="fas fa-exclamation-circle"></i>
                        <span>${provider.errorCount || 0}</span>
                    </div>
                </div>
                <div class="card-actions" onclick="event.stopPropagation()">
                    <button class="card-action-btn ${toggleButtonClass}" onclick="window.toggleProviderStatus('${provider.uuid}', event)" title="${toggleButtonText}">
                        <i class="${toggleButtonIcon}"></i>
                    </button>
                    <button class="card-action-btn btn-delete" onclick="window.deleteProvider('${provider.uuid}', event)" title="${t('modal.provider.delete')}">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
                <div class="provider-item-content" id="content-${provider.uuid}">
                    ${renderProviderConfig(provider)}
                </div>
            </div>
        `;
    }).join('');
    html += '</div>';
    return html;
}

/**
 * Render provider list
 * @param {Array} providers - Provider array
 * @returns {string} HTML string
 */
function renderProviderList(providers) {
    if (currentViewMode === 'card') {
        return renderProviderCardList(providers);
    } else {
        return renderProviderDetailList(providers);
    }
}

/**
 * Render provider config
 * @param {Object} provider - Provider object
 * @returns {string} HTML string
 */
function renderProviderConfig(provider) {
    // Get all field definitions for this provider type (from utils.js)
    const fieldConfigs = getProviderTypeFields(currentProviderType);
    
    // Get field display order
    const fieldOrder = getFieldOrder(provider);
    
    // First render base config fields (customName, checkModelName, checkHealth)
    let html = '<div class="form-grid">';
    const baseFields = ['customName', 'checkModelName', 'checkHealth', 'concurrencyLimit', 'queueLimit'];
    
    baseFields.forEach(fieldKey => {
        const displayLabel = getFieldLabel(fieldKey);
        const value = provider[fieldKey];
        const displayValue = (value !== undefined && value !== null) ? value : '';
        
        // Find field definition for placeholder
        const fieldDef = fieldConfigs.find(f => f.id === fieldKey) || fieldConfigs.find(f => f.id.toUpperCase() === fieldKey.toUpperCase()) || {};
        const placeholder = fieldDef.placeholder || (fieldKey === 'customName' ? 'Node custom name' : (fieldKey === 'checkModelName' ? 'e.g. gpt-3.5-turbo' : (fieldKey === 'concurrencyLimit' ? 'Max concurrency, 0 for no limit' : (fieldKey === 'queueLimit' ? 'Max queue, 0 for no limit' : ''))));
        
        // If customName field, use plain text input
        if (fieldKey === 'customName') {
            html += `
                <div class="config-item">
                    <label>${displayLabel}</label>
                    <input type="text"
                           value="${displayValue}"
                           readonly
                           data-config-key="${fieldKey}"
                           data-config-value="${(value !== undefined && value !== null) ? value : ''}"
                           placeholder="${placeholder}">
                </div>
            `;
        } else if (fieldKey === 'checkHealth') {
            // If no value, default to false
            const actualValue = value !== undefined ? value : false;
            const isEnabled = actualValue === true || actualValue === 'true';
            html += `
                <div class="config-item">
                    <label>${displayLabel}</label>
                    <select class="form-control"
                            data-config-key="${fieldKey}"
                            data-config-value="${actualValue}"
                            disabled>
                        <option value="true" ${isEnabled ? 'selected' : ''} data-i18n="modal.provider.enabled">Enabled</option>
                        <option value="false" ${!isEnabled ? 'selected' : ''} data-i18n="modal.provider.disabled">Disabled</option>
                    </select>
                </div>
            `;
        } else {
            // checkModelName field always shown
            html += `
                <div class="config-item">
                    <label>${displayLabel}</label>
                    <input type="text"
                           value="${displayValue}"
                           readonly
                           data-config-key="${fieldKey}"
                           data-config-value="${(value !== undefined && value !== null) ? value : ''}"
                           placeholder="${placeholder}">
                </div>
            `;
        }
    });
    html += '</div>';
    
    // Render other config fields, two per row
    const otherFields = fieldOrder.filter(key => !baseFields.includes(key));
    
    for (let i = 0; i < otherFields.length; i += 2) {
        html += '<div class="form-grid">';
        
        const field1Key = otherFields[i];
        const field1Label = getFieldLabel(field1Key);
        const field1Value = provider[field1Key];
        const field1IsPassword = field1Key.toLowerCase().includes('key') || field1Key.toLowerCase().includes('password');
        const field1IsOAuthFilePath = field1Key.includes('OAUTH_CREDS_FILE_PATH');
        const field1DisplayValue = field1IsPassword && field1Value ? '••••••••' : ((field1Value !== undefined && field1Value !== null) ? field1Value : '');
        const field1Def = fieldConfigs.find(f => f.id === field1Key) || fieldConfigs.find(f => f.id.toUpperCase() === field1Key.toUpperCase()) || {};
        
        if (field1IsPassword) {
            html += `
                <div class="config-item">
                    <label>${field1Label}</label>
                    <div class="password-input-wrapper">
                        <input type="password"
                               value="${field1DisplayValue}"
                               readonly
                               data-config-key="${field1Key}"
                               data-config-value="${(field1Value !== undefined && field1Value !== null) ? field1Value : ''}"
                               placeholder="${field1Def.placeholder || ''}">
                       <button type="button" class="password-toggle" data-target="${field1Key}">
                            <i class="fas fa-eye"></i>
                        </button>
                    </div>
                </div>
            `;
        } else if (field1IsOAuthFilePath) {
            // OAuth credential file path field, add upload button
            const field1IsKiro = field1Key.includes('KIRO');
            html += `
                <div class="config-item">
                    <label>${field1Label}</label>
                    <div class="file-input-group">
                        <input type="text"
                               id="edit-${provider.uuid}-${field1Key}"
                               value="${(field1Value !== undefined && field1Value !== null) ? field1Value : ''}"
                               readonly
                               data-config-key="${field1Key}"
                               data-config-value="${(field1Value !== undefined && field1Value !== null) ? field1Value : ''}"
                               placeholder="${field1Def.placeholder || ''}">
                       <button type="button" class="btn btn-outline upload-btn" data-target="edit-${provider.uuid}-${field1Key}" aria-label="Upload file" disabled>
                            <i class="fas fa-upload"></i>
                        </button>
                    </div>
                    ${field1IsKiro ? '<small class="form-text"><i class="fas fa-info-circle"></i> ' + t('modal.provider.kiroAuthHint') + '</small>' : ''}
                </div>
            `;
        } else {
            html += `
                <div class="config-item">
                    <label>${field1Label}</label>
                    <input type="text"
                           value="${field1DisplayValue}"
                           readonly
                           data-config-key="${field1Key}"
                           data-config-value="${(field1Value !== undefined && field1Value !== null) ? field1Value : ''}"
                           placeholder="${field1Def.placeholder || ''}">
                </div>
            `;
        }
        
        // If there is a second field
        if (i + 1 < otherFields.length) {
            const field2Key = otherFields[i + 1];
            const field2Label = getFieldLabel(field2Key);
            const field2Value = provider[field2Key];
            const field2IsPassword = field2Key.toLowerCase().includes('key') || field2Key.toLowerCase().includes('password');
            const field2IsOAuthFilePath = field2Key.includes('OAUTH_CREDS_FILE_PATH');
            const field2DisplayValue = field2IsPassword && field2Value ? '••••••••' : ((field2Value !== undefined && field2Value !== null) ? field2Value : '');
            const field2Def = fieldConfigs.find(f => f.id === field2Key) || fieldConfigs.find(f => f.id.toUpperCase() === field2Key.toUpperCase()) || {};
            
            if (field2IsPassword) {
                html += `
                    <div class="config-item">
                        <label>${field2Label}</label>
                        <div class="password-input-wrapper">
                            <input type="password"
                                   value="${field2DisplayValue}"
                                   readonly
                                   data-config-key="${field2Key}"
                                   data-config-value="${(field2Value !== undefined && field2Value !== null) ? field2Value : ''}"
                                   placeholder="${field2Def.placeholder || ''}">
                            <button type="button" class="password-toggle" data-target="${field2Key}">
                                <i class="fas fa-eye"></i>
                            </button>
                        </div>
                    </div>
                `;
            } else if (field2IsOAuthFilePath) {
                // OAuth credential file path field, add upload button
                const field2IsKiro = field2Key.includes('KIRO');
                html += `
                    <div class="config-item">
                        <label>${field2Label}</label>
                        <div class="file-input-group">
                            <input type="text"
                                   id="edit-${provider.uuid}-${field2Key}"
                                   value="${(field2Value !== undefined && field2Value !== null) ? field2Value : ''}"
                                   readonly
                                   data-config-key="${field2Key}"
                                   data-config-value="${(field2Value !== undefined && field2Value !== null) ? field2Value : ''}"
                                   placeholder="${field2Def.placeholder || ''}">
                            <button type="button" class="btn btn-outline upload-btn" data-target="edit-${provider.uuid}-${field2Key}" aria-label="Upload file" disabled>
                                <i class="fas fa-upload"></i>
                            </button>
                        </div>
                        ${field2IsKiro ? '<small class="form-text"><i class="fas fa-info-circle"></i> ' + t('modal.provider.kiroAuthHint') + '</small>' : ''}
                    </div>
                `;
            } else {
                html += `
                    <div class="config-item">
                        <label>${field2Label}</label>
                        <input type="text"
                               value="${field2DisplayValue}"
                               readonly
                               data-config-key="${field2Key}"
                               data-config-value="${(field2Value !== undefined && field2Value !== null) ? field2Value : ''}"
                               placeholder="${field2Def.placeholder || ''}">
                    </div>
                `;
            }
        }
        
        html += '</div>';
    }
    
    // Add notSupportedModels config section
    if (usesManagedModelList(currentProviderType)) {
        html += '<div class="form-grid full-width">';
        html += renderSupportedModelsSection(provider);
        html += '</div>';
        return html;
    }

    html += '<div class="form-grid full-width">';
    html += `
        <div class="config-item not-supported-models-section">
            <label>
                <i class="fas fa-ban"></i> <span data-i18n="modal.provider.unsupportedModels">Unsupported Models</span>
                <span class="help-text" data-i18n="modal.provider.unsupportedModelsHelp">Select models not supported by this provider. They will be automatically excluded.</span>
            </label>
            <div class="not-supported-models-container" data-uuid="${provider.uuid}">
                <div class="models-loading">
                    <i class="fas fa-spinner fa-spin"></i> <span data-i18n="modal.provider.loadingModels">Loading model list...</span>
                </div>
            </div>
        </div>
    `;
    html += '</div>';
    
    return html;
}

/**
 * Get field display order
 * @param {Object} provider - Provider object
 * @returns {Array} Field key array
 */
/**
 * Get field display order
 * @param {Object} provider - Provider object
 * @returns {Array} Field name array
 */
function getFieldOrder(provider) {
    const orderedFields = ['customName', 'checkModelName', 'checkHealth', 'concurrencyLimit', 'queueLimit'];
    
    // Internal state fields to exclude
    const excludedFields = [
        'isHealthy', 'lastUsed', 'usageCount', 'errorCount', 'lastErrorTime',
        'uuid', 'isDisabled', 'lastHealthCheckTime', 'lastHealthCheckModel', 'lastErrorMessage',
        'notSupportedModels', 'supportedModels', 'refreshCount', 'needsRefresh', '_lastSelectionSeq',
        'lastRefreshTime', 'lastSuccessTime'
    ];
    
    // Try to get provider type from current modal context
    let providerType = currentProviderType;
    
    // If no context type, try to infer from object fields (fallback logic)
    if (!providerType) {
        if (provider.OPENAI_API_KEY && provider.OPENAI_BASE_URL) {
            providerType = 'openai-custom';
        } else if (provider.CLAUDE_API_KEY && provider.CLAUDE_BASE_URL) {
            providerType = 'claude-custom';
        } else if (provider.GEMINI_OAUTH_CREDS_FILE_PATH) {
            providerType = 'gemini-cli-oauth';
        } else if (provider.KIRO_OAUTH_CREDS_FILE_PATH) {
            providerType = 'claude-kiro-oauth';
        } else if (provider.QWEN_OAUTH_CREDS_FILE_PATH) {
            providerType = 'openai-qwen-oauth';
        } else if (provider.ANTIGRAVITY_OAUTH_CREDS_FILE_PATH) {
            providerType = 'gemini-antigravity';
        } else if (provider.IFLOW_OAUTH_CREDS_FILE_PATH) {
            providerType = 'openai-iflow';
        } else if (provider.CODEX_OAUTH_CREDS_FILE_PATH) {
            providerType = 'openai-codex-oauth';
        } else if (provider.GROK_COOKIE_TOKEN) {
            providerType = 'grok-custom';
        } else if (provider.FORWARD_API_KEY) {
            providerType = 'forward-api';
        }
    }

    // Get predefined field list for this type from utils.js (supports prefix matching)
    const predefinedFields = providerType ? getProviderTypeFields(providerType) : [];
    const predefinedOrder = predefinedFields.map(f => f.id);
    
    // Get other fields in current object but not in predefined list
    const otherFields = Object.keys(provider).filter(key =>
        !excludedFields.includes(key) &&
        !orderedFields.includes(key) &&
        !predefinedOrder.includes(key)
    );
    otherFields.sort();

    // Merge all fields to display
    const allExpectedFields = [...orderedFields, ...predefinedOrder, ...otherFields];
    
    // Only show field if it exists in provider or is a predefined field for this provider type
    return allExpectedFields.filter(key =>
        Object.prototype.hasOwnProperty.call(provider, key) || predefinedOrder.includes(key)
    );
}

/**
 * Toggle provider details display
 * @param {string} uuid - Provider UUID
 */
function toggleProviderDetails(uuid) {
    const content = document.getElementById(`content-${uuid}`);
    if (content) {
        content.classList.toggle('expanded');
    }
}

/**
 * Edit provider
 * @param {string} uuid - Provider UUID
 * @param {Event} event - Event object
 */
function editProvider(uuid, event) {
    event.stopPropagation();
    
    const providerDetail = event.target.closest('.provider-item-detail, .provider-item-card');
    const configInputs = providerDetail.querySelectorAll('input[data-config-key]');
    const configSelects = providerDetail.querySelectorAll('select[data-config-key]');
    const content = providerDetail.querySelector(`#content-${uuid}`);
    
    // If not expanded, auto-expand edit box
    if (content && !content.classList.contains('expanded')) {
        toggleProviderDetails(uuid);
    }
    
    // Wait for expand animation to complete, then switch inputs to editable
    setTimeout(() => {
        // Switch inputs to editable state
        configInputs.forEach(input => {
            input.readOnly = false;
            if (input.type === 'password') {
                const actualValue = input.dataset.configValue;
                input.value = actualValue;
            }
        });
        
        // Enable file upload buttons
        const uploadButtons = providerDetail.querySelectorAll('.upload-btn');
        uploadButtons.forEach(button => {
            button.disabled = false;
        });
        
        // Enable dropdown selects
        configSelects.forEach(select => {
            select.disabled = false;
        });
        
        // Enable model checkboxes
        const modelCheckboxes = providerDetail.querySelectorAll('.model-checkbox');
        modelCheckboxes.forEach(checkbox => {
            checkbox.disabled = false;
        });

        const detectModelsButton = providerDetail.querySelector('.detect-models-btn');
        if (detectModelsButton) {
            detectModelsButton.disabled = false;
        }
        
        // Add editing state class
        providerDetail.classList.add('editing');
        
        // Replace edit button with save/cancel buttons, hide disable/enable button
        const actionsGroup = providerDetail.querySelector('.provider-actions-group');
        
        actionsGroup.innerHTML = `
            <button class="btn-small btn-save" onclick="window.saveProvider('${uuid}', event)">
                <i class="fas fa-save"></i> <span data-i18n="modal.provider.save">Save</span>
            </button>
            <button class="btn-small btn-cancel" onclick="window.cancelEdit('${uuid}', event)">
                <i class="fas fa-times"></i> <span data-i18n="modal.provider.cancel">Cancel</span>
            </button>
        `;
    }, 100);
}

/**
 * Cancel edit
 * @param {string} uuid - Provider UUID
 * @param {Event} event - Event object
 */
function cancelEdit(uuid, event) {
    event.stopPropagation();
    
    const providerDetail = event.target.closest('.provider-item-detail, .provider-item-card');
    const configInputs = providerDetail.querySelectorAll('input[data-config-key]');
    const configSelects = providerDetail.querySelectorAll('select[data-config-key]');
    
    // Restore inputs to read-only state
    configInputs.forEach(input => {
        input.readOnly = true;
        const originalValue = input.dataset.configValue;
        // Restore original value
        if (input.type === 'password') {
            input.value = originalValue ? '••••••••' : '';
        } else {
            input.value = originalValue || '';
        }
    });
    
    // Disable model checkboxes
    const modelCheckboxes = providerDetail.querySelectorAll('.model-checkbox');
    modelCheckboxes.forEach(checkbox => {
        checkbox.disabled = true;
    });

    const detectModelsButton = providerDetail.querySelector('.detect-models-btn');
    if (detectModelsButton) {
        detectModelsButton.disabled = true;
    }

    if (usesManagedModelList(currentProviderType)) {
        resetSupportedModelsSelection(uuid);
    } else {
        const currentProviderData = currentProviders.find(provider => provider.uuid === uuid);
        if (currentProviderData) {
            renderNotSupportedModelsSelector(uuid, cachedModels, currentProviderData.notSupportedModels || []);
        }
    }
    
    // Remove editing state class
    providerDetail.classList.remove('editing');
    
    // Disable file upload buttons
    const uploadButtons = providerDetail.querySelectorAll('.upload-btn');
    uploadButtons.forEach(button => {
        button.disabled = true;
    });
    
    // Disable dropdown selects
    configSelects.forEach(select => {
        select.disabled = true;
        // Restore original value
        const originalValue = select.dataset.configValue;
        select.value = originalValue || '';
    });
    
    // Restore original button layout
    const actionsGroup = providerDetail.querySelector('.provider-actions-group');
    const currentProvider = providerDetail.closest('.provider-modal').querySelector(`[data-uuid="${uuid}"]`);
    const isCurrentlyDisabled = currentProvider.classList.contains('disabled');
    const toggleButtonText = isCurrentlyDisabled ? t('modal.provider.enabled') : t('modal.provider.disabled');
    const toggleButtonIcon = isCurrentlyDisabled ? 'fas fa-play' : 'fas fa-ban';
    const toggleButtonClass = isCurrentlyDisabled ? 'btn-success' : 'btn-warning';
    
    actionsGroup.innerHTML = `
        <button class="btn-small ${toggleButtonClass}" onclick="window.toggleProviderStatus('${uuid}', event)" title="${toggleButtonText}this provider">
            <i class="${toggleButtonIcon}"></i> ${toggleButtonText}
        </button>
        <button class="btn-small btn-edit" onclick="window.editProvider('${uuid}', event)">
            <i class="fas fa-edit"></i> <span data-i18n="modal.provider.edit">${t('modal.provider.edit')}</span>
        </button>
        <button class="btn-small btn-info btn-provider-health-check" onclick="window.performSingleHealthCheck('${uuid}', event)" title="${t('modal.provider.healthCheckCurrentTitle')}">
            <i class="fas fa-stethoscope"></i> <span data-i18n="modal.provider.healthCheck">${t('modal.provider.healthCheck')}</span>
        </button>
        <button class="btn-small btn-delete" onclick="window.deleteProvider('${uuid}', event)">
            <i class="fas fa-trash"></i> <span data-i18n="modal.provider.delete">${t('modal.provider.delete')}</span>
        </button>
        <button class="btn-small btn-refresh-uuid" onclick="window.refreshProviderUuid('${uuid}', event)" title="${t('modal.provider.refreshUuid')}">
            <i class="fas fa-sync-alt"></i>
        </button>
    `;
}

/**
 * Save provider
 * @param {string} uuid - Provider UUID
 * @param {Event} event - Event object
 */
async function saveProvider(uuid, event) {
    event.stopPropagation();
    
    const providerDetail = event.target.closest('.provider-item-detail, .provider-item-card');
    const providerType = providerDetail.closest('.provider-modal').getAttribute('data-provider-type');
    
    const providerConfig = collectDraftProviderConfig(providerDetail, providerType, uuid);
    
    
    
    // Collect unsupported model list
    
    try {
        await window.apiClient.put(`/providers/${encodeURIComponent(providerType)}/${uuid}`, { providerConfig });
        await window.apiClient.post('/reload-config');
        showToast(t('common.success'), t('modal.provider.save.success'), 'success');
        // Re-fetch latest config for this provider type
        await refreshProviderConfig(providerType);
    } catch (error) {
        console.error('Failed to update provider:', error);
        showToast(t('common.error'), t('modal.provider.save.failed') + ': ' + error.message, 'error');
    }
}

/**
 * Delete provider
 * @param {string} uuid - Provider UUID
 * @param {Event} event - Event object
 */
async function deleteProvider(uuid, event) {
    event.stopPropagation();
    
    if (!confirm(t('modal.provider.deleteConfirm'))) {
        return;
    }
    
    const providerDetail = event.target.closest('.provider-item-detail, .provider-item-card');
    const providerType = providerDetail.closest('.provider-modal').getAttribute('data-provider-type');
    
    try {
        await window.apiClient.delete(`/providers/${encodeURIComponent(providerType)}/${uuid}`);
        await window.apiClient.post('/reload-config');
        showToast(t('common.success'), t('modal.provider.delete.success'), 'success');
        // Re-fetch latest config
        await refreshProviderConfig(providerType);
    } catch (error) {
        console.error('Failed to delete provider:', error);
        showToast(t('common.error'), t('modal.provider.delete.failed') + ': ' + error.message, 'error');
    }
}

/**
 * Re-fetch and refresh provider config
 * @param {string} providerType - Provider type
 */
async function refreshProviderConfig(providerType) {
    try {
        // Re-fetch latest data for this provider type
        const data = await window.apiClient.get(`/providers/${encodeURIComponent(providerType)}`);
        
        // If modal for this provider type is displayed, update it
        const modal = document.querySelector('.provider-modal');
        if (modal && modal.getAttribute('data-provider-type') === providerType) {
            // Update cached provider data
            currentProviders = data.providers;
            currentProviderType = providerType;
            
            // Update statistics
            const totalCountElement = modal.querySelector('.provider-summary-item .value');
            if (totalCountElement) {
                totalCountElement.textContent = data.totalCount;
            }
            
            const healthyCountElement = modal.querySelectorAll('.provider-summary-item .value')[1];
            if (healthyCountElement) {
                healthyCountElement.textContent = data.healthyCount;
            }
            
            const totalPages = Math.ceil(data.providers.length / PROVIDERS_PER_PAGE);
            
            // Ensure current page does not exceed total pages
            if (currentPage > totalPages) {
                currentPage = Math.max(1, totalPages);
            }
            
            // Re-render provider list (paginated)
            const providerList = modal.querySelector('.provider-list');
            if (providerList) {
                providerList.innerHTML = renderProviderListPaginated(data.providers, currentPage);
            }
            
            // Update pagination controls
            const paginationContainers = modal.querySelectorAll('.pagination-container');
            if (totalPages > 1) {
                paginationContainers.forEach(container => {
                    const position = container.getAttribute('data-position');
                    container.outerHTML = renderPagination(currentPage, totalPages, data.providers.length, position);
                });
                
                // If no pagination controls existed, add them
                if (paginationContainers.length === 0) {
                    const modalBody = modal.querySelector('.provider-modal-body');
                    const providerListEl = modal.querySelector('.provider-list');
                    if (modalBody && providerListEl) {
                        providerListEl.insertAdjacentHTML('beforebegin', renderPagination(currentPage, totalPages, data.providers.length, 'top'));
                        providerListEl.insertAdjacentHTML('afterend', renderPagination(currentPage, totalPages, data.providers.length, 'bottom'));
                    }
                }
            } else {
                // If only one page, remove pagination controls
                paginationContainers.forEach(container => container.remove());
            }
            
            // Reload model list for current page
            const startIndex = (currentPage - 1) * PROVIDERS_PER_PAGE;
            const endIndex = Math.min(startIndex + PROVIDERS_PER_PAGE, data.providers.length);
            const pageProviders = data.providers.slice(startIndex, endIndex);
            loadModelsForProviderType(providerType, pageProviders);
        }
        
        // Also update provider stats on main interface
        if (typeof window.loadProviders === 'function') {
            await window.loadProviders();
        }
        
    } catch (error) {
        console.error('Failed to refresh provider config:', error);
    }
}

/**
 * Show add provider form
 * @param {string} providerType - Provider type
 */
function showAddProviderForm(providerType) {
    const modal = document.querySelector('.provider-modal');
    const existingForm = modal.querySelector('.add-provider-form');
    
    if (existingForm) {
        existingForm.remove();
        return;
    }
    
    // Codex OAuth only supports authorization add, not manual add
    if (providerType === 'openai-codex-oauth') {
        const form = document.createElement('div');
        form.className = 'add-provider-form';
        form.innerHTML = `
            <h4 data-i18n="modal.provider.addTitle"><i class="fas fa-plus"></i> Add New Provider Configuration</h4>
            <div class="oauth-only-notice" style="padding: 20px; background: #fef3c7; border: 1px solid #fcd34d; border-radius: 8px; margin: 15px 0;">
                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
                    <i class="fas fa-info-circle" style="color: #d97706; font-size: 24px;"></i>
                    <strong style="color: #92400e;">Codex only supports OAuth authorization</strong>
                </div>
                <p style="color: #b45309; margin: 0 0 15px 0;">
                    OpenAI Codex requires OAuth authorization to obtain access tokens. Cannot manually enter credentials. Click the button below to authorize.
                </p>
                <button class="btn btn-primary" onclick="window.handleGenerateAuthUrl && window.handleGenerateAuthUrl('openai-codex-oauth'); this.closest('.add-provider-form').remove();">
                    <i class="fas fa-key"></i> Start OAuth Authorization
                </button>
                <button class="btn btn-secondary" style="margin-left: 10px;" onclick="this.closest('.add-provider-form').remove()">
                    <i class="fas fa-times"></i> <span data-i18n="modal.provider.cancel">Cancel</span>
                </button>
            </div>
        `;
        
        const providerList = modal.querySelector('.provider-list');
        providerList.parentNode.insertBefore(form, providerList);
        return;
    }
    
    const form = document.createElement('div');
    form.className = 'add-provider-form';
    form.innerHTML = `
        <h4 data-i18n="modal.provider.addTitle"><i class="fas fa-plus"></i> Add New Provider Configuration</h4>
        <div class="form-grid">
            <div class="form-group">
                <label><span data-i18n="modal.provider.customName">Custom Name</span> <span class="optional-mark" data-i18n="config.optional">(Optional)</span></label>
                <input type="text" id="newCustomName" data-i18n="modal.provider.customName" placeholder="e.g. My Node 1">
            </div>
            <div class="form-group">
                <label><span data-i18n="modal.provider.checkModelName">Check Model Name</span> <span class="optional-mark" data-i18n="config.optional">(Optional)</span></label>
                <input type="text" id="newCheckModelName" data-i18n="modal.provider.checkModelName" placeholder="e.g. gpt-3.5-turbo">
            </div>
            <div class="form-group">
                <label data-i18n="modal.provider.healthCheckLabel">Health Check</label>
                <select id="newCheckHealth">
                    <option value="false" data-i18n="modal.provider.disabled">Disabled</option>
                    <option value="true" data-i18n="modal.provider.enabled">Enabled</option>
                </select>
            </div>
            <div class="form-group">
                <label><span data-i18n="modal.provider.concurrencyLimit">Concurrency Limit</span> <span class="optional-mark" data-i18n="config.optional">(Optional)</span></label>
                <input type="number" id="newConcurrencyLimit" placeholder="Default 0 for no limit">
            </div>
            <div class="form-group">
                <label><span data-i18n="modal.provider.queueLimit">Queue Limit</span> <span class="optional-mark" data-i18n="config.optional">(Optional)</span></label>
                <input type="number" id="newQueueLimit" placeholder="Default 0 for no limit">
            </div>
        </div>
        <div id="dynamicConfigFields">
            <!-- Dynamic config fields will be displayed here -->
        </div>
        <div class="form-actions" style="margin-top: 15px;">
            <button class="btn btn-success" onclick="window.addProvider('${providerType}')">
                <i class="fas fa-save"></i> <span data-i18n="modal.provider.save">Save</span>
            </button>
            <button class="btn btn-secondary" onclick="this.closest('.add-provider-form').remove()">
                <i class="fas fa-times"></i> <span data-i18n="modal.provider.cancel">Cancel</span>
            </button>
        </div>
    `;
    
    // Add dynamic config fields
    addDynamicConfigFields(form, providerType);
    
    // Bind event listeners for password toggle buttons in add form
    bindAddFormPasswordToggleListeners(form);
    
    // Insert before provider list
    const providerList = modal.querySelector('.provider-list');
    providerList.parentNode.insertBefore(form, providerList);
}

/**
 * Add dynamic config fields
 * @param {HTMLElement} form - Form element
 * @param {string} providerType - Provider type
 */
function addDynamicConfigFields(form, providerType) {
    const configFields = form.querySelector('#dynamicConfigFields');
    
    // Get field config for this provider type (URL fields already in utils.js)
    const allFields = getProviderTypeFields(providerType);
    
    // Filter out five base fields already hardcoded in form-grid to avoid duplicates
    const baseFields = ['customName', 'checkModelName', 'checkHealth', 'concurrencyLimit', 'queueLimit'];
    const filteredFields = allFields.filter(f => !baseFields.some(bf => f.id.toLowerCase().includes(bf.toLowerCase())));

    let fields = '';
    
    if (filteredFields.length > 0) {
        // Display in groups, two fields per row
        for (let i = 0; i < filteredFields.length; i += 2) {
            fields += '<div class="form-grid">';
            
            const field1 = filteredFields[i];
            // Check if password type field
            const isPassword1 = field1.type === 'password';
            // Check if OAuth credential file path field (compatible with both naming conventions)
            const isOAuthFilePath1 = field1.id.includes('OAUTH_CREDS_FILE_PATH') || field1.id.includes('OauthCredsFilePath');
            
            if (isPassword1) {
                fields += `
                    <div class="form-group">
                        <label>${field1.label}</label>
                        <div class="password-input-wrapper">
                            <input type="password" id="new${field1.id}" placeholder="${field1.placeholder || ''}" value="${field1.value || ''}">
                            <button type="button" class="password-toggle" data-target="new${field1.id}">
                                <i class="fas fa-eye"></i>
                            </button>
                        </div>
                    </div>
                `;
            } else if (isOAuthFilePath1) {
                // OAuth credential file path field, add upload button
                const isKiroField = field1.id.includes('KIRO');
    fields += `
        <div class="form-group">
            <label>${field1.label}</label>
            <div class="file-input-group">
                <input type="text" id="new${field1.id}" class="form-control" placeholder="${field1.placeholder || ''}" value="${field1.value || ''}">
                <button type="button" class="btn btn-outline upload-btn" data-target="new${field1.id}" aria-label="Upload file">
                    <i class="fas fa-upload"></i>
                </button>
            </div>
            ${isKiroField ? '<small class="form-text"><i class="fas fa-info-circle"></i> ' + t('modal.provider.kiroAuthHint') + '</small>' : ''}
        </div>
    `;
            } else {
                fields += `
                    <div class="form-group">
                        <label>${field1.label}</label>
                        <input type="${field1.type}" id="new${field1.id}" placeholder="${field1.placeholder || ''}" value="${field1.value || ''}">
                    </div>
                `;
            }
            
            const field2 = filteredFields[i + 1];
            if (field2) {
                // Check if password type field
                const isPassword2 = field2.type === 'password';
                // Check if OAuth credential file path field (compatible with both naming conventions)
                const isOAuthFilePath2 = field2.id.includes('OAUTH_CREDS_FILE_PATH') || field2.id.includes('OauthCredsFilePath');
                
                if (isPassword2) {
                    fields += `
                        <div class="form-group">
                            <label>${field2.label}</label>
                            <div class="password-input-wrapper">
                                <input type="password" id="new${field2.id}" placeholder="${field2.placeholder || ''}" value="${field2.value || ''}">
                                <button type="button" class="password-toggle" data-target="new${field2.id}">
                                    <i class="fas fa-eye"></i>
                                </button>
                            </div>
                        </div>
                    `;
                } else if (isOAuthFilePath2) {
                    // OAuth credential file path field, add upload button
                    const isKiroField = field2.id.includes('KIRO');
    fields += `
        <div class="form-group">
            <label>${field2.label}</label>
            <div class="file-input-group">
                <input type="text" id="new${field2.id}" class="form-control" placeholder="${field2.placeholder || ''}" value="${field2.value || ''}">
                <button type="button" class="btn btn-outline upload-btn" data-target="new${field2.id}" aria-label="Upload file">
                    <i class="fas fa-upload"></i>
                </button>
            </div>
            ${isKiroField ? '<small class="form-text"><i class="fas fa-info-circle"></i> ' + t('modal.provider.kiroAuthHint') + '</small>' : ''}
        </div>
    `;
                } else {
                    fields += `
                        <div class="form-group">
                            <label>${field2.label}</label>
                            <input type="${field2.type}" id="new${field2.id}" placeholder="${field2.placeholder || ''}" value="${field2.value || ''}">
                        </div>
                    `;
                }
            }
            
            fields += '</div>';
        }
    } else {
        fields = `<p data-i18n="modal.provider.noProviderType">${t('modal.provider.noProviderType')}</p>`;
    }
    
    configFields.innerHTML = fields;
}

/**
 * Bind event listeners for password toggle buttons in add form
 * @param {HTMLElement} form - Form element
 */
function bindAddFormPasswordToggleListeners(form) {
    const passwordToggles = form.querySelectorAll('.password-toggle');
    passwordToggles.forEach(button => {
        button.addEventListener('click', function() {
            const targetId = this.getAttribute('data-target');
            const input = document.getElementById(targetId);
            const icon = this.querySelector('i');
            
            if (!input || !icon) return;
            
            if (input.type === 'password') {
                input.type = 'text';
                icon.className = 'fas fa-eye-slash';
            } else {
                input.type = 'password';
                icon.className = 'fas fa-eye';
            }
        });
    });
}

/**
 * Add New Provider
 * @param {string} providerType - Provider type
 */
async function addProvider(providerType) {
    const customName = document.getElementById('newCustomName')?.value;
    const checkModelName = document.getElementById('newCheckModelName')?.value;
    const checkHealth = document.getElementById('newCheckHealth')?.value === 'true';
    const concurrencyLimit = parseInt(document.getElementById('newConcurrencyLimit')?.value || '0');
    const queueLimit = parseInt(document.getElementById('newQueueLimit')?.value || '0');
    
    const providerConfig = {
        customName: customName || '', // Allow empty
        checkModelName: checkModelName || '', // Allow empty
        checkHealth,
        concurrencyLimit,
        queueLimit
    };
    
    // Dynamically collect config fields based on provider type (auto-match utils.js)
    const allFields = getProviderTypeFields(providerType);
    allFields.forEach(field => {
        const element = document.getElementById(`new${field.id}`);
        if (element) {
            providerConfig[field.id] = element.value || '';
        }
    });
    
    try {
        await window.apiClient.post('/providers', {
            providerType,
            providerConfig
        });
        await window.apiClient.post('/reload-config');
        showToast(t('common.success'), t('modal.provider.add.success'), 'success');
        // Remove add form
        const form = document.querySelector('.add-provider-form');
        if (form) {
            form.remove();
        }
        // Re-fetch latest config data
        await refreshProviderConfig(providerType);
    } catch (error) {
        console.error('Failed to add provider:', error);
        showToast(t('common.error'), t('modal.provider.add.failed') + ': ' + error.message, 'error');
    }
}

/**
 * Toggle provider disable/enable status
 * @param {string} uuid - Provider UUID
 * @param {Event} event - Event object
 */
async function toggleProviderStatus(uuid, event) {
    event.stopPropagation();
    
    const providerDetail = event.target.closest('.provider-item-detail, .provider-item-card');
    const providerType = providerDetail.closest('.provider-modal').getAttribute('data-provider-type');
    const currentProvider = providerDetail.closest('.provider-modal').querySelector(`[data-uuid="${uuid}"]`);
    
    // Get current provider info
    const isCurrentlyDisabled = currentProvider.classList.contains('disabled');
    const action = isCurrentlyDisabled ? 'enable' : 'disable';
    const confirmMessage = isCurrentlyDisabled ?
        t('modal.provider.enableConfirm') :
        t('modal.provider.disableConfirm');
    
    if (!confirm(confirmMessage)) {
        return;
    }
    
    try {
        await window.apiClient.post(`/providers/${encodeURIComponent(providerType)}/${uuid}/${action}`, { action });
        await window.apiClient.post('/reload-config');
        showToast(t('common.success'), t('common.success'), 'success');
        // Re-fetch latest config for this provider type
        await refreshProviderConfig(providerType);
    } catch (error) {
        console.error('Failed to toggle provider status:', error);
        showToast(t('common.error'), t('common.error') + ': ' + error.message, 'error');
    }
}

/**
 * Reset health status of all providers
 * @param {string} providerType - Provider type
 */
async function resetAllProvidersHealth(providerType) {
    if (!confirm(t('modal.provider.resetHealthConfirm', {type: providerType}))) {
        return;
    }
    
    try {
        showToast(t('common.info'), t('modal.provider.resetHealth') + '...', 'info');
        
        const response = await window.apiClient.post(
            `/providers/${encodeURIComponent(providerType)}/reset-health`,
            {}
        );
        
        if (response.success) {
            showToast(t('common.success'), t('modal.provider.resetHealth.success', { count: response.resetCount }), 'success');
            
            // Reload config
            await window.apiClient.post('/reload-config');
            
            // Refresh provider config display
            await refreshProviderConfig(providerType);
        } else {
            showToast(t('common.error'), t('modal.provider.resetHealth.failed'), 'error');
        }
    } catch (error) {
        console.error('Failed to reset health status:', error);
        showToast(t('common.error'), t('modal.provider.resetHealth.failed') + ': ' + error.message, 'error');
    }
}

/**
 * Perform health check
 * @param {string} providerType - Provider type
 */
async function performHealthCheck(providerType) {
    if (!confirm(t('modal.provider.healthCheckConfirm', {type: providerType}))) {
        return;
    }
    
    try {
        showToast(t('common.info'), t('modal.provider.healthCheck') + '...', 'info');
        
        const response = await window.apiClient.post(
            `/providers/${encodeURIComponent(providerType)}/health-check`,
            {}
        );
        
        if (response.success) {
            const { successCount, failCount, totalCount, results } = response;
            
            // Count skipped (checkHealth not enabled)
            const skippedCount = results ? results.filter(r => r.success === null).length : 0;
            
            let message = `${t('modal.provider.healthCheck.complete', { success: successCount })}`;
            if (failCount > 0) message += t('modal.provider.healthCheck.abnormal', { fail: failCount });
            if (skippedCount > 0) message += t('modal.provider.healthCheck.skipped', { skipped: skippedCount });
            
            showToast(t('common.info'), message, failCount > 0 ? 'warning' : 'success');
            
            // Reload config
            await window.apiClient.post('/reload-config');
            
            // Refresh provider config display
            await refreshProviderConfig(providerType);
        } else {
            showToast(t('common.error'), t('modal.provider.healthCheck') + ' ' + t('common.error'), 'error');
        }
    } catch (error) {
        console.error('Health check failed:', error);
        showToast(t('common.error'), t('modal.provider.healthCheck') + ' ' + t('common.error') + ': ' + error.message, 'error');
    }
}

/**
 * Refresh provider UUID
 * @param {string} uuid - Provider UUID
 * @param {Event} event - Event object
 */
async function performSingleHealthCheck(uuid, event) {
    event.stopPropagation();

    const button = event.currentTarget || event.target.closest('button');
    const providerDetail = event.target.closest('.provider-item-detail, .provider-item-card');
    const providerType = providerDetail?.closest('.provider-modal')?.getAttribute('data-provider-type');

    if (!providerDetail || !providerType) {
        showToast(t('common.error'), t('modal.provider.healthCheckSingleFailed', { message: t('common.error') }), 'error');
        return;
    }

    const originalHtml = button ? button.innerHTML : '';

    try {
        if (button) {
            button.disabled = true;
            button.innerHTML = `<i class="fas fa-spinner fa-spin"></i> <span>${t('modal.provider.healthCheck')}</span>`;
        }

        showToast(t('common.info'), t('modal.provider.healthCheck') + '...', 'info');

        const response = await window.apiClient.post(
            `/providers/${encodeURIComponent(providerType)}/${uuid}/health-check`,
            {}
        );

        if (!response.success) {
            showToast(t('common.error'), t('modal.provider.healthCheckSingleFailed', { message: t('common.error') }), 'error');
            return;
        }

        const message = response.healthy
            ? (response.modelName
                ? t('modal.provider.healthCheckSingleSuccessWithModel', { model: response.modelName })
                : t('modal.provider.healthCheckSingleSuccess'))
            : t('modal.provider.healthCheckSingleFailed', { message: response.message || t('common.error') });

        showToast(
            response.healthy ? t('common.success') : t('common.warning'),
            message,
            response.healthy ? 'success' : 'warning'
        );

        await window.apiClient.post('/reload-config');
        await refreshProviderConfig(providerType);
    } catch (error) {
        console.error('Single provider health check failed:', error);
        showToast(
            t('common.error'),
            t('modal.provider.healthCheckSingleFailed', { message: error.message }),
            'error'
        );
    } finally {
        if (button && button.isConnected) {
            button.innerHTML = originalHtml;
            button.disabled = false;
        }
    }
}

async function refreshProviderUuid(uuid, event) {
    event.stopPropagation();
    
    if (!confirm(t('modal.provider.refreshUuidConfirm', { oldUuid: uuid }))) {
        return;
    }
    
    const providerDetail = event.target.closest('.provider-item-detail, .provider-item-card');
    const providerType = providerDetail.closest('.provider-modal').getAttribute('data-provider-type');
    
    try {
        const response = await window.apiClient.post(
            `/providers/${encodeURIComponent(providerType)}/${uuid}/refresh-uuid`,
            {}
        );
        
        if (response.success) {
            showToast(t('common.success'), t('modal.provider.refreshUuid.success', { oldUuid: response.oldUuid, newUuid: response.newUuid }), 'success');
            
            // Reload config
            await window.apiClient.post('/reload-config');
            
            // Refresh provider config display
            await refreshProviderConfig(providerType);
        } else {
            showToast(t('common.error'), t('modal.provider.refreshUuid.failed'), 'error');
        }
    } catch (error) {
        console.error('Failed to refresh UUID:', error);
        showToast(t('common.error'), t('modal.provider.refreshUuid.failed') + ': ' + error.message, 'error');
    }
}

/**
 * Delete all unhealthy provider nodes
 * @param {string} providerType - Provider type
 */
async function deleteUnhealthyProviders(providerType) {
    // First get unhealthy node count
    const unhealthyCount = currentProviders.filter(p => !p.isHealthy).length;
    
    if (unhealthyCount === 0) {
        showToast(t('common.info'), t('modal.provider.deleteUnhealthy.noUnhealthy'), 'info');
        return;
    }
    
    if (!confirm(t('modal.provider.deleteUnhealthyConfirm', { type: providerType, count: unhealthyCount }))) {
        return;
    }
    
    try {
        showToast(t('common.info'), t('modal.provider.deleteUnhealthy.deleting'), 'info');
        
        const response = await window.apiClient.delete(
            `/providers/${encodeURIComponent(providerType)}/delete-unhealthy`
        );
        
        if (response.success) {
            showToast(
                t('common.success'),
                t('modal.provider.deleteUnhealthy.success', { count: response.deletedCount }),
                'success'
            );
            
            // Reload config
            await window.apiClient.post('/reload-config');
            
            // Refresh provider config display
            await refreshProviderConfig(providerType);
        } else {
            showToast(t('common.error'), t('modal.provider.deleteUnhealthy.failed'), 'error');
        }
    } catch (error) {
        console.error('Failed to delete unhealthy nodes:', error);
        showToast(t('common.error'), t('modal.provider.deleteUnhealthy.failed') + ': ' + error.message, 'error');
    }
}

/**
 * Batch refresh UUIDs of unhealthy nodes
 * @param {string} providerType - Provider type
 */
async function refreshUnhealthyUuids(providerType) {
    // First get unhealthy node count
    const unhealthyCount = currentProviders.filter(p => !p.isHealthy).length;
    
    if (unhealthyCount === 0) {
        showToast(t('common.info'), t('modal.provider.refreshUnhealthyUuids.noUnhealthy'), 'info');
        return;
    }
    
    if (!confirm(t('modal.provider.refreshUnhealthyUuidsConfirm', { type: providerType, count: unhealthyCount }))) {
        return;
    }
    
    try {
        showToast(t('common.info'), t('modal.provider.refreshUnhealthyUuids.refreshing'), 'info');
        
        const response = await window.apiClient.post(
            `/providers/${encodeURIComponent(providerType)}/refresh-unhealthy-uuids`
        );
        
        if (response.success) {
            showToast(
                t('common.success'),
                t('modal.provider.refreshUnhealthyUuids.success', { count: response.refreshedCount }),
                'success'
            );
            
            // Reload config
            await window.apiClient.post('/reload-config');
            
            // Refresh provider config display
            await refreshProviderConfig(providerType);
        } else {
            showToast(t('common.error'), t('modal.provider.refreshUnhealthyUuids.failed'), 'error');
        }
    } catch (error) {
        console.error('Failed to refresh unhealthy node UUIDs:', error);
        showToast(t('common.error'), t('modal.provider.refreshUnhealthyUuids.failed') + ': ' + error.message, 'error');
    }
}

/**
 * Render unsupported model selector (no API call, use passed model list)
 * @param {string} uuid - Provider UUID
 * @param {Array} models - Model list
 * @param {Array} notSupportedModels - Current unsupported model list
 */
function renderNotSupportedModelsSelector(uuid, models, notSupportedModels = []) {
    const container = document.querySelector(`.not-supported-models-container[data-uuid="${uuid}"]`);
    if (!container) return;
    
    if (models.length === 0) {
        container.innerHTML = `<div class="no-models" data-i18n="modal.provider.noModels">${t('modal.provider.noModels')}</div>`;
        return;
    }
    
    // Render model checkbox list
    let html = '<div class="models-checkbox-grid">';
    models.forEach(model => {
        const isChecked = notSupportedModels.includes(model);
        html += `
            <label class="model-checkbox-label">
                <input type="checkbox"
                       class="model-checkbox"
                       value="${model}"
                       data-uuid="${uuid}"
                       ${isChecked ? 'checked' : ''}
                       disabled>
                <span class="model-name">${model}</span>
            </label>
        `;
    });
    html += '</div>';
    
    container.innerHTML = html;
}

// Export all functions and mount to window object for HTML calls
export {
    showProviderManagerModal,
    closeProviderModal,
    toggleProviderDetails,
    editProvider,
    cancelEdit,
    saveProvider,
    deleteProvider,
    refreshProviderConfig,
    showAddProviderForm,
    addProvider,
    toggleProviderStatus,
    resetAllProvidersHealth,
    performHealthCheck,
    deleteUnhealthyProviders,
    refreshUnhealthyUuids,
    openSupportedModelsPicker,
    loadModelsForProviderType,
    renderNotSupportedModelsSelector,
    goToProviderPage,
    performSingleHealthCheck,
    refreshProviderUuid
};

// Mount functions to window object
window.closeProviderModal = closeProviderModal;
window.toggleProviderDetails = toggleProviderDetails;
window.editProvider = editProvider;
window.cancelEdit = cancelEdit;
window.saveProvider = saveProvider;
window.deleteProvider = deleteProvider;
window.showAddProviderForm = showAddProviderForm;
window.addProvider = addProvider;
window.toggleProviderStatus = toggleProviderStatus;
window.resetAllProvidersHealth = resetAllProvidersHealth;
window.performHealthCheck = performHealthCheck;
window.performSingleHealthCheck = performSingleHealthCheck;
window.deleteUnhealthyProviders = deleteUnhealthyProviders;
window.refreshUnhealthyUuids = refreshUnhealthyUuids;
window.openSupportedModelsPicker = openSupportedModelsPicker;
window.goToProviderPage = goToProviderPage;
window.refreshProviderUuid = refreshProviderUuid;
