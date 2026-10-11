// ============================================================
// src/main.js — Main Application Entry Point
// ============================================================
import './core.js';
import './users-dashboard.js';
import './master-data.js';
import './potongan.js';
import './potongan-modal.js';
import './penjualan-expense-rows.js';
import './penjualan-form.js';
import './penjualan.js';
import './penjualan-excel.js';
import './penagihan.js';
import './penagihan-modal.js';
import './solar-calc.js';
import './solar-ui.js';
import './laporan.js';
import './laporan-pdf.js';
import './bulk-delete.js';
import { initAuth } from './core.js';

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initAuth());
} else {
    initAuth();
}
