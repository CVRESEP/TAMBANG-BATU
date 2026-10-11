// ============================================================
// src/app.js — Router, Modal, Mobile Sidebar & App Init
// ============================================================
import { getData, saveData, generateId, formatDate, showToast, handleUserSignOut } from './core.js';
import { initBulkDeleteListeners } from './bulk-delete.js';

export function _initApp() {
    // Current Date Display
    const curDateEl = document.getElementById('current-date');
    if (curDateEl) curDateEl.textContent = formatDate();

    // Navigation Router
    const navLinks = document.querySelectorAll('.nav-link');
    const pages = document.querySelectorAll('.page');
    const pageTitle = document.getElementById('page-title');

    window.navigateTo = function (targetId) {
        pages.forEach(p => p.classList.remove('active'));
        navLinks.forEach(l => l.classList.remove('active'));
        const targetPage = document.getElementById(targetId);
        if (targetPage) targetPage.classList.add('active');
        const targetLink = document.querySelector(`.nav-link[data-target="${targetId}"]`);
        if (targetLink) {
            targetLink.classList.add('active');
            const linkText = Array.from(targetLink.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join('');
            if (pageTitle) pageTitle.textContent = linkText || targetLink.innerText.split('\n').pop().trim();
        }
        if (window[`render_${targetId}`]) window[`render_${targetId}`]();
    };

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            window.navigateTo(e.currentTarget.dataset.target);
        });
    });

    // Modals
    const modalOverlay = document.getElementById('modal-overlay');
    const formModal = document.getElementById('form-modal');
    const btnCloseModal = document.getElementById('btn-close-modal');

    window.openModal = function (title, contentHtml, maxWidth = null) {
        const titleEl = document.getElementById('modal-title');
        if (titleEl) titleEl.textContent = title;
        const body = document.getElementById('modal-body-content');
        if (body) body.innerHTML = contentHtml;
        if (formModal) formModal.style.maxWidth = maxWidth || '500px';
        if (modalOverlay) modalOverlay.classList.add('active');
        if (formModal) formModal.classList.add('active');
        setTimeout(() => focusFirstInput(body), 50);
    };

    window.closeModal = function () {
        if (modalOverlay) modalOverlay.classList.remove('active');
        if (formModal) {
            formModal.classList.remove('active');
            formModal.style.maxWidth = '';
        }
    };

    function focusFirstInput(container) {
        if (!container) return;
        const firstInput = container.querySelector('input:not([readonly]):not([type="hidden"]), select, textarea');
        if (firstInput) {
            firstInput.focus();
            if (firstInput.select && firstInput.type !== 'date') firstInput.select();
        }
    }
    window.focusFirstInput = focusFirstInput;

    if (btnCloseModal) btnCloseModal.addEventListener('click', window.closeModal);
    if (modalOverlay) {
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) window.closeModal();
        });
    }

    // Mobile Sidebar Toggle
    const btnToggle = document.getElementById('btn-toggle-sidebar');
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebar-overlay');

    if (btnToggle && sidebar && overlay) {
        const toggleSidebar = () => {
            sidebar.classList.toggle('active');
            overlay.classList.toggle('active');
        };

        btnToggle.addEventListener('click', toggleSidebar);
        overlay.addEventListener('click', toggleSidebar);

        navLinks.forEach(link => {
            link.addEventListener('click', () => {
                if (window.innerWidth <= 768) {
                    toggleSidebar();
                }
            });
        });
    }

    // Initial load
    window.navigateTo('dashboard');

    // Potongan Filters
    const pStart = document.getElementById('filter-potongan-start');
    const pEnd = document.getElementById('filter-potongan-end');
    if (pStart && pEnd) {
        const now = new Date();
        const dayOfWeek = now.getDay();
        const monday = new Date(now);
        monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        pStart.value = monday.toISOString().split('T')[0];
        pEnd.value = sunday.toISOString().split('T')[0];
        pStart.addEventListener('change', () => window.render_potongan && window.render_potongan());
        pEnd.addEventListener('change', () => window.render_potongan && window.render_potongan());
    }

    const sType = document.getElementById('filter-setoran-type');
    if (sType) sType.addEventListener('change', () => window.render_potongan && window.render_potongan());

    initBulkDeleteListeners();
}
