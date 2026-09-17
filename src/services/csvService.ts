/**
 * Kedai PAPA POS - Reusable CSV Export & Import Service
 * SYNCROZZ Engineering Standard (SES) v4.4 Locked
 *
 * Requirements:
 * - RFC 4180 standard compliant
 * - UTF-8 with BOM (\uFEFF) for Malay / Windows Excel compatibility
 * - Proper escaping of quotes, commas, and multiline values
 * - Preserves leading zeroes and text values (e.g. phone numbers, codes)
 * - Controlled import validation with pre-commit review summary
 */

import {
  Product,
  Supplier,
  StaffUser,
  Customer,
  LoyaltyLedgerEntry,
  CsvImportMode,
  ProductCatalogUpdatePayload,
  Sale,
  Purchase,
  InventoryMovement,
  MasterCatalogSyncValidationResult,
  MasterSyncProductRow,
  MasterSyncMissingProduct,
} from '../types';
import { SmartInputService } from './smartInputService';
import { ProductService } from './productService';

export interface CsvImportValidationResult<T> {
  totalRows: number;
  validCount: number;
  duplicateCount: number;
  invalidCount: number;
  validItems: T[];
  duplicates: { rowNumber: number; reason: string; item: T }[];
  errors: { rowNumber: number; reason: string; rawRow: Record<string, string> }[];
}

export type { CsvImportMode };
export type CsvRowAction = 'NEW' | 'UPDATE' | 'SKIP' | 'INVALID';

export interface CsvProductImportRow {
  rowNumber: number;
  action: CsvRowAction;
  sku: string;
  name: string;
  category: string;
  costPrice: number;
  sellingPrice: number;
  csvStock: number;
  minimumStock: number;
  active: boolean;
  reason: string;
  stockNote: string;
  existingProductId?: string;
  rawRow: Record<string, string>;
}

export type CsvProductUpdateItem = ProductCatalogUpdatePayload;

export interface CsvProductsUpsertValidationResult
  extends CsvImportValidationResult<Omit<Product, 'id' | 'storeId' | 'createdAt' | 'updatedAt'>> {
  totalRows: number;
  newCount: number;
  updateCount: number;
  skipCount: number;
  invalidCount: number;
  existingCount: number;
  mode: CsvImportMode;
  rows: CsvProductImportRow[];
  newItems: Omit<Product, 'id' | 'storeId' | 'createdAt' | 'updatedAt'>[];
  updateItems: CsvProductUpdateItem[];
}

export class CsvService {
  /**
   * Generates and downloads a standardized CSV file with UTF-8 BOM.
   */
  public static downloadCsv(
    filename: string,
    headers: string[],
    rows: (string | number | boolean | null | undefined)[][]
  ): void {
    const escapeCell = (val: string | number | boolean | null | undefined): string => {
      if (val === null || val === undefined) return '';
      const str = String(val);
      // If contains quote, comma, or newline, wrap in quotes and escape internal quotes
      if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const headerLine = headers.map(escapeCell).join(',');
    const bodyLines = rows.map((r) => r.map(escapeCell).join(',')).join('\r\n');
    const csvContent = `\uFEFF${headerLine}\r\n${bodyLines}`;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename.endsWith('.csv') ? filename : `${filename}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /**
   * Exports Products catalogue to CSV.
   */
  public static exportProducts(products: Product[]): void {
    const headers = [
      'SKU',
      'Name',
      'Category',
      'Cost Price (RM)',
      'Selling Price (RM)',
      'Current Stock',
      'Minimum Stock',
      'Status',
    ];

    const rows = products.map((p) => [
      p.sku,
      p.name,
      p.category,
      p.costPrice.toFixed(2),
      p.sellingPrice.toFixed(2),
      p.currentStock,
      p.minimumStock,
      p.active ? 'ACTIVE' : 'INACTIVE',
    ]);

    const dateStr = new Date().toISOString().slice(0, 10);
    this.downloadCsv(`kedai_papa_products_${dateStr}.csv`, headers, rows);
  }

  /**
   * Exports Suppliers to CSV.
   */
  public static exportSuppliers(suppliers: Supplier[]): void {
    const headers = [
      'Supplier Code',
      'Supplier Name',
      'Contact Person',
      'Phone',
      'Email',
      'Address',
      'Status',
    ];

    const rows = suppliers.map((s) => [
      s.supplierCode,
      s.supplierName,
      s.contactPerson || '',
      s.phone || '',
      s.email || '',
      s.address || '',
      s.active ? 'ACTIVE' : 'INACTIVE',
    ]);

    const dateStr = new Date().toISOString().slice(0, 10);
    this.downloadCsv(`kedai_papa_suppliers_${dateStr}.csv`, headers, rows);
  }

  /**
   * Exports Customers to CSV.
   */
  public static exportCustomers(customers: Customer[], loyaltyLedger?: LoyaltyLedgerEntry[]): void {
    const headers = [
      'Customer Code',
      'Customer Name',
      'Phone',
      'Email',
      'Loyalty Points',
      'Notes',
      'Status',
    ];

    const rows = customers.map((c) => {
      let points = 0;
      if (loyaltyLedger) {
        points = loyaltyLedger
          .filter((l) => l.customerId === c.id)
          .reduce((sum, l) => sum + (l.type === 'EARNED' ? l.points : -l.points), 0);
      }

      return [
        c.customerCode,
        c.customerName,
        c.phone || '',
        c.email || '',
        points.toString(),
        c.notes || '',
        c.active ? 'ACTIVE' : 'INACTIVE',
      ];
    });

    const dateStr = new Date().toISOString().slice(0, 10);
    this.downloadCsv(`kedai_papa_customers_${dateStr}.csv`, headers, rows);
  }

  /**
   * Parses CSV text into an array of row objects mapping headers to values.
   */
  public static parseCsvText(csvText: string): { headers: string[]; rows: Record<string, string>[] } {
    // Strip BOM if present
    const cleanText = csvText.replace(/^\uFEFF/, '');
    const lines: string[] = [];
    let curLine = '';
    let inQuotes = false;

    for (let i = 0; i < cleanText.length; i++) {
      const char = cleanText[i];
      const nextChar = cleanText[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          curLine += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if ((char === '\r' || char === '\n') && !inQuotes) {
        if (curLine.trim()) {
          lines.push(curLine);
        }
        curLine = '';
        if (char === '\r' && nextChar === '\n') i++; // Skip \n in CRLF
      } else {
        curLine += char;
      }
    }
    if (curLine.trim()) {
      lines.push(curLine);
    }

    if (lines.length === 0) {
      return { headers: [], rows: [] };
    }

    const parseLineToCells = (line: string): string[] => {
      const cells: string[] = [];
      let cell = '';
      let cellInQuotes = false;

      for (let j = 0; j < line.length; j++) {
        const c = line[j];
        const nextC = line[j + 1];

        if (c === '"') {
          if (cellInQuotes && nextC === '"') {
            cell += '"';
            j++;
          } else {
            cellInQuotes = !cellInQuotes;
          }
        } else if (c === ',' && !cellInQuotes) {
          cells.push(cell.trim());
          cell = '';
        } else {
          cell += c;
        }
      }
      cells.push(cell.trim());
      return cells;
    };

    const rawHeaders = parseLineToCells(lines[0]);
    const headers = rawHeaders.map((h) => h.replace(/^["']|["']$/g, '').trim());

    const rows: Record<string, string>[] = [];
    for (let k = 1; k < lines.length; k++) {
      const cells = parseLineToCells(lines[k]);
      if (cells.every((c) => c === '')) continue; // Skip completely empty lines
      const rowObj: Record<string, string> = {};
      headers.forEach((h, idx) => {
        rowObj[h] = cells[idx] !== undefined ? cells[idx] : '';
      });
      rows.push(rowObj);
    }

    return { headers, rows };
  }

  /**
   * Validates products from imported CSV with explicit Upsert & Safe Mode support.
   * Classifies rows into NEW, UPDATE, SKIP, and INVALID with clear reasoning.
   */
  public static validateProductsUpsert(
    csvRows: Record<string, string>[],
    existingProducts: Product[],
    mode: CsvImportMode = 'SKIP_EXISTING'
  ): CsvProductsUpsertValidationResult {
    const existingSkuMap = new Map<string, Product>();
    existingProducts.forEach((p) => {
      existingSkuMap.set(SmartInputService.normalizeCode(p.sku), p);
    });

    const seenBatchSkus = new Set<string>();

    const rows: CsvProductImportRow[] = [];
    const newItems: Omit<Product, 'id' | 'storeId' | 'createdAt' | 'updatedAt'>[] = [];
    const updateItems: CsvProductUpdateItem[] = [];
    const duplicates: { rowNumber: number; reason: string; item: any }[] = [];
    const errors: { rowNumber: number; reason: string; rawRow: Record<string, string> }[] = [];

    let existingCount = 0;

    csvRows.forEach((row, index) => {
      const rowNumber = index + 2; // Account for 1-based index and header line

      // Find keys case-insensitively with optional exclusion filter to prevent collisions
      // e.g. "Cost Price (RM)" must not collide with "Selling Price (RM)"
      const findVal = (keyPattern: RegExp, excludePattern?: RegExp) => {
        const matchingKey = Object.keys(row).find((k) => {
          if (!keyPattern.test(k)) return false;
          if (excludePattern && excludePattern.test(k)) return false;
          return true;
        });
        return matchingKey ? row[matchingKey] : '';
      };

      const rawSku = findVal(/sku|barcode|bar_code|kod/i);
      const rawName = findVal(/name|nama|tajuk|description|item|produk/i);
      const rawCategory = findVal(/category|kategori/i);

      // Cost price: matches cost/kos/modal/beli
      const rawCost = findVal(/cost|kos|modal|beli/i);

      // Selling price: prioritize explicit selling/jual/retail, OR price/harga excluding cost/kos/modal/beli
      const rawPrice =
        findVal(/selling|jual|retail/i) ||
        findVal(/price|harga/i, /cost|kos|modal|beli/i);

      // Current stock: prioritize current_stock/semasa, OR stock/stok/qty excluding min/minimum/ambang
      const rawStock =
        findVal(/current.*stock|stok.*semasa|current|semasa/i) ||
        findVal(/stock|stok|qty|kuantiti/i, /min|minimum|ambang/i);

      const rawMinStock = findVal(/min|minimum|ambang/i);
      const rawStatus = findVal(/status|active|aktif/i);

      const sku = SmartInputService.normalizeCode(rawSku);
      const name = SmartInputService.normalizeName(rawName);

      if (!sku) {
        const reason = 'SKU tidak boleh kosong.';
        errors.push({ rowNumber, reason, rawRow: row });
        rows.push({
          rowNumber,
          action: 'INVALID',
          sku: rawSku || '-',
          name: rawName || '-',
          category: rawCategory || '-',
          costPrice: 0,
          sellingPrice: 0,
          csvStock: 0,
          minimumStock: 0,
          active: false,
          reason,
          stockNote: 'Baris tidak sah - dibatalkan.',
          rawRow: row,
        });
        return;
      }

      if (!name) {
        const reason = 'Nama produk tidak boleh kosong.';
        errors.push({ rowNumber, reason, rawRow: row });
        rows.push({
          rowNumber,
          action: 'INVALID',
          sku,
          name: rawName || '-',
          category: rawCategory || '-',
          costPrice: 0,
          sellingPrice: 0,
          csvStock: 0,
          minimumStock: 0,
          active: false,
          reason,
          stockNote: 'Baris tidak sah - dibatalkan.',
          rawRow: row,
        });
        return;
      }

      // Check duplicate within the same batch
      if (seenBatchSkus.has(sku)) {
        const reason = `SKU '${sku}' berulang dalam fail CSV ini.`;
        errors.push({ rowNumber, reason, rawRow: row });
        duplicates.push({ rowNumber, reason, item: { sku, name } });
        rows.push({
          rowNumber,
          action: 'INVALID',
          sku,
          name,
          category: rawCategory || 'General',
          costPrice: SmartInputService.parseNumeric(rawCost, 0),
          sellingPrice: SmartInputService.parseNumeric(rawPrice, 0),
          csvStock: Math.max(0, Math.floor(SmartInputService.parseNumeric(rawStock, 0))),
          minimumStock: Math.max(0, Math.floor(SmartInputService.parseNumeric(rawMinStock, 5))),
          active: true,
          reason,
          stockNote: 'Baris pendua dalam fail - dibatalkan.',
          rawRow: row,
        });
        return;
      }

      seenBatchSkus.add(sku);

      const existingProd = existingSkuMap.get(sku);
      const parsedStock = Math.max(0, Math.floor(SmartInputService.parseNumeric(rawStock, 0)));

      // Parse status if present
      let isActive = true;
      if (rawStatus) {
        isActive = !/inactive|tidak|false|0/i.test(rawStatus);
      } else if (existingProd) {
        isActive = existingProd.active;
      }

      if (existingProd) {
        existingCount++;

        const costPrice = rawCost !== ''
          ? SmartInputService.roundToTwoDecimals(SmartInputService.parseNumeric(rawCost, existingProd.costPrice))
          : existingProd.costPrice;
        const sellingPrice = rawPrice !== ''
          ? SmartInputService.roundToTwoDecimals(SmartInputService.parseNumeric(rawPrice, existingProd.sellingPrice))
          : existingProd.sellingPrice;
        const category = rawCategory ? rawCategory.trim() : existingProd.category;
        const minimumStock = rawMinStock !== ''
          ? Math.max(0, Math.floor(SmartInputService.parseNumeric(rawMinStock, existingProd.minimumStock)))
          : existingProd.minimumStock;

        if (mode === 'SKIP_EXISTING') {
          const reason = `SKU '${sku}' sudah wujud dalam katalog (mod Langkau Sedia Ada).`;
          duplicates.push({ rowNumber, reason, item: { sku, name } });
          rows.push({
            rowNumber,
            action: 'SKIP',
            sku,
            name,
            category,
            costPrice,
            sellingPrice,
            csvStock: parsedStock,
            minimumStock,
            active: isActive,
            reason,
            stockNote: 'Stock column ignored for existing products.',
            existingProductId: existingProd.id,
            rawRow: row,
          });
        } else {
          // UPDATE_EXISTING
          const reason = `SKU '${sku}' sepadan dengan produk sedia ada (${existingProd.name}). Katalog akan dikemas kini.`;
          const updateItem: CsvProductUpdateItem = {
            existingProductId: existingProd.id,
            sku: existingProd.sku,
            name,
            category: category || 'General',
            costPrice,
            sellingPrice,
            minimumStock,
            active: isActive,
            ignoredCsvStock: parsedStock,
          };
          updateItems.push(updateItem);
          rows.push({
            rowNumber,
            action: 'UPDATE',
            sku,
            name,
            category,
            costPrice,
            sellingPrice,
            csvStock: parsedStock,
            minimumStock,
            active: isActive,
            reason,
            stockNote: 'Stock column ignored for existing products.',
            existingProductId: existingProd.id,
            rawRow: row,
          });
        }
      } else {
        // Genuinely NEW product
        const costPrice = SmartInputService.roundToTwoDecimals(SmartInputService.parseNumeric(rawCost, 0));
        const sellingPrice = SmartInputService.roundToTwoDecimals(SmartInputService.parseNumeric(rawPrice, 0));
        const category = (rawCategory || 'Snacks & Biscuits').trim();
        const minimumStock = Math.max(0, Math.floor(SmartInputService.parseNumeric(rawMinStock, 5)));

        const newItem: Omit<Product, 'id' | 'storeId' | 'createdAt' | 'updatedAt'> = {
          sku,
          name,
          category,
          costPrice,
          sellingPrice,
          currentStock: parsedStock,
          minimumStock,
          active: isActive,
        };

        newItems.push(newItem);
        rows.push({
          rowNumber,
          action: 'NEW',
          sku,
          name,
          category,
          costPrice,
          sellingPrice,
          csvStock: parsedStock,
          minimumStock,
          active: isActive,
          reason: 'Produk baru - akan didaftarkan ke katalog.',
          stockNote:
            parsedStock > 0
              ? `Pembukaan stok: ${parsedStock} unit (STOCK_IN direkodkan)`
              : 'Tiada pembukaan stok (0 unit)',
          rawRow: row,
        });
      }
    });

    const newCount = rows.filter((r) => r.action === 'NEW').length;
    const updateCount = rows.filter((r) => r.action === 'UPDATE').length;
    const skipCount = rows.filter((r) => r.action === 'SKIP').length;
    const invalidCount = rows.filter((r) => r.action === 'INVALID').length;

    return {
      totalRows: csvRows.length,
      validCount: newCount,
      duplicateCount: skipCount,
      invalidCount,
      validItems: newItems,
      duplicates,
      errors,
      newCount,
      updateCount,
      skipCount,
      existingCount,
      mode,
      rows,
      newItems,
      updateItems,
    };
  }

  /**
   * Validates and normalizes products from imported CSV before commit.
   * Preserves backward compatibility by invoking validateProductsUpsert with SKIP_EXISTING.
   */
  public static validateProductsImport(
    csvRows: Record<string, string>[],
    existingProducts: Product[]
  ): CsvImportValidationResult<Omit<Product, 'id' | 'storeId' | 'createdAt' | 'updatedAt'>> {
    return this.validateProductsUpsert(csvRows, existingProducts, 'SKIP_EXISTING');
  }

  /**
   * MASTER CATALOG SYNC / OVERRIDE VALIDATION
   * Validates imported CSV rows where the CSV represents the authoritative CURRENT MASTER CATALOG.
   * - SKU is the primary matching key.
   * - Existing SKU = UPDATE / OVERRIDE CURRENT PRODUCT DATA (or UNCHANGED if identical).
   * - New SKU = NEW PRODUCT (opening stock via STOCK_IN).
   * - Stock differences create ADJUSTMENT movements (+X or -X). Zero diff creates no movement.
   * - Duplicate SKU inside the same CSV is strictly INVALID (Section 29).
   * - Missing products: DEACTIVATED if historical records exist; REMOVED if demo/unused (Section 15-17).
   */
  public static validateMasterCatalogSync(
    csvRows: Record<string, string>[],
    existingProducts: Product[],
    sales: Sale[] = [],
    purchases: Purchase[] = [],
    movements: InventoryMovement[] = []
  ): MasterCatalogSyncValidationResult {
    // 1. Pre-scan SKU frequencies within this CSV batch to detect internal duplicate SKUs
    const skuFrequencyMap = new Map<string, number>();
    csvRows.forEach((row) => {
      const matchingKey = Object.keys(row).find((k) => /sku/i.test(k));
      const rawSku = matchingKey ? row[matchingKey] : '';
      const norm = SmartInputService.normalizeCode(rawSku);
      if (norm) {
        skuFrequencyMap.set(norm, (skuFrequencyMap.get(norm) || 0) + 1);
      }
    });

    const existingSkuMap = new Map<string, Product>();
    existingProducts.forEach((p) => {
      existingSkuMap.set(SmartInputService.normalizeCode(p.sku), p);
    });

    const rows: MasterSyncProductRow[] = [];
    const errors: { rowNumber: number; reason: string; rawRow: Record<string, string> }[] = [];
    const validCsvSkus = new Set<string>();

    csvRows.forEach((row, index) => {
      const rowNumber = index + 2; // Header is line 1

      // Find keys case-insensitively with optional exclusion filter to prevent collisions
      // e.g. "Cost Price (RM)" must not collide with "Selling Price (RM)"
      const findVal = (pattern: RegExp, excludePattern?: RegExp) => {
        const matchingKey = Object.keys(row).find((k) => {
          if (!pattern.test(k)) return false;
          if (excludePattern && excludePattern.test(k)) return false;
          return true;
        });
        return matchingKey ? row[matchingKey] : '';
      };

      const rawSku = findVal(/sku|barcode|bar_code|kod/i);
      const rawName = findVal(/name|nama|tajuk|description|item|produk/i);
      const rawCategory = findVal(/category|kategori/i);

      // Cost price: matches cost/kos/modal/beli
      const rawCost = findVal(/cost|kos|modal|beli/i);

      // Selling price: prioritize explicit selling/jual/retail, OR price/harga excluding cost/kos/modal/beli
      const rawPrice =
        findVal(/selling|jual|retail/i) ||
        findVal(/price|harga/i, /cost|kos|modal|beli/i);

      // Current stock: prioritize current_stock/semasa, OR stock/stok/qty excluding min/minimum/ambang
      const rawStock =
        findVal(/current.*stock|stok.*semasa|current|semasa/i) ||
        findVal(/stock|stok|qty|kuantiti/i, /min|minimum|ambang/i);

      const rawMinStock = findVal(/min|minimum|ambang/i);
      const rawStatus = findVal(/status|active|aktif/i);

      const sku = SmartInputService.normalizeCode(rawSku);
      const name = SmartInputService.normalizeName(rawName);

      // Validation 1: SKU must be present
      if (!sku) {
        const reason = 'SKU tidak boleh kosong.';
        errors.push({ rowNumber, reason, rawRow: row });
        rows.push({
          rowNumber,
          action: 'INVALID',
          sku: rawSku || '-',
          name: rawName || '-',
          category: rawCategory || '-',
          costPrice: 0,
          sellingPrice: 0,
          csvStock: 0,
          minimumStock: 0,
          active: false,
          reason,
          stockNote: 'Baris tidak sah - SKU kosong.',
          rawRow: row,
        });
        return;
      }

      // Validation 2: Duplicate SKU inside the same CSV file (Section 29)
      if ((skuFrequencyMap.get(sku) || 0) > 1) {
        const reason = `Duplikasi SKU '${sku}' dikesan dalam fail CSV ini. Setiap baris mesti mempunyai SKU yang unik.`;
        errors.push({ rowNumber, reason, rawRow: row });
        rows.push({
          rowNumber,
          action: 'INVALID',
          sku,
          name: name || rawName || '-',
          category: rawCategory || 'General',
          costPrice: SmartInputService.parseNumeric(rawCost, 0),
          sellingPrice: SmartInputService.parseNumeric(rawPrice, 0),
          csvStock: SmartInputService.parseNumeric(rawStock, 0),
          minimumStock: SmartInputService.parseNumeric(rawMinStock, 5),
          active: true,
          reason,
          stockNote: 'Baris pendua dalam fail CSV - pembetulan fail diperlukan.',
          rawRow: row,
        });
        return;
      }

      // Validation 3: Product name must be present
      if (!name) {
        const reason = 'Nama produk tidak boleh kosong.';
        errors.push({ rowNumber, reason, rawRow: row });
        rows.push({
          rowNumber,
          action: 'INVALID',
          sku,
          name: rawName || '-',
          category: rawCategory || '-',
          costPrice: 0,
          sellingPrice: 0,
          csvStock: 0,
          minimumStock: 0,
          active: false,
          reason,
          stockNote: 'Baris tidak sah - Nama kosong.',
          rawRow: row,
        });
        return;
      }

      // Validation 4: Cost Price numeric & >= 0
      const trimmedCost = rawCost.trim();
      const parsedCostNum = trimmedCost !== '' ? Number(trimmedCost.replace(/[^0-9.-]+/g, '')) : NaN;
      if (trimmedCost === '' || isNaN(parsedCostNum) || parsedCostNum < 0 || !isFinite(parsedCostNum)) {
        const reason = `Harga kos '${rawCost}' tidak sah. Sila masukkan nombor bukan negatif.`;
        errors.push({ rowNumber, reason, rawRow: row });
        rows.push({
          rowNumber,
          action: 'INVALID',
          sku,
          name,
          category: rawCategory || '-',
          costPrice: 0,
          sellingPrice: 0,
          csvStock: 0,
          minimumStock: 0,
          active: false,
          reason,
          stockNote: 'Baris tidak sah - Kos tidak sah.',
          rawRow: row,
        });
        return;
      }

      // Validation 5: Selling Price numeric & >= 0
      const trimmedPrice = rawPrice.trim();
      const parsedPriceNum = trimmedPrice !== '' ? Number(trimmedPrice.replace(/[^0-9.-]+/g, '')) : NaN;
      if (trimmedPrice === '' || isNaN(parsedPriceNum) || parsedPriceNum < 0 || !isFinite(parsedPriceNum)) {
        const reason = `Harga jualan '${rawPrice}' tidak sah. Sila masukkan nombor bukan negatif.`;
        errors.push({ rowNumber, reason, rawRow: row });
        rows.push({
          rowNumber,
          action: 'INVALID',
          sku,
          name,
          category: rawCategory || '-',
          costPrice: SmartInputService.roundToTwoDecimals(parsedCostNum),
          sellingPrice: 0,
          csvStock: 0,
          minimumStock: 0,
          active: false,
          reason,
          stockNote: 'Baris tidak sah - Harga jualan tidak sah.',
          rawRow: row,
        });
        return;
      }

      // Validation 6: Stock safety (Section 8: numeric, integer, >= 0, no NaN, no Infinity)
      const trimmedStock = rawStock.trim();
      const parsedStockNum = trimmedStock !== '' ? Number(trimmedStock.replace(/[^0-9.-]+/g, '')) : NaN;
      if (
        trimmedStock === '' ||
        isNaN(parsedStockNum) ||
        parsedStockNum < 0 ||
        !isFinite(parsedStockNum) ||
        !Number.isInteger(parsedStockNum)
      ) {
        const reason = `Nilai stok '${rawStock}' tidak sah. Stok mestilah nombor bulat (integer) bukan negatif.`;
        errors.push({ rowNumber, reason, rawRow: row });
        rows.push({
          rowNumber,
          action: 'INVALID',
          sku,
          name,
          category: rawCategory || '-',
          costPrice: SmartInputService.roundToTwoDecimals(parsedCostNum),
          sellingPrice: SmartInputService.roundToTwoDecimals(parsedPriceNum),
          csvStock: 0,
          minimumStock: 0,
          active: false,
          reason,
          stockNote: 'Baris tidak sah - Nilai stok tidak sah.',
          rawRow: row,
        });
        return;
      }

      const costPrice = SmartInputService.roundToTwoDecimals(parsedCostNum);
      const sellingPrice = SmartInputService.roundToTwoDecimals(parsedPriceNum);
      const csvStock = parsedStockNum;
      const category = (rawCategory || 'Snacks & Biscuits').trim();
      const minimumStock = rawMinStock !== '' ? Math.max(0, Math.floor(SmartInputService.parseNumeric(rawMinStock, 5))) : 5;

      let active = true;
      if (rawStatus) {
        active = !/inactive|tidak|false|0/i.test(rawStatus);
      }

      validCsvSkus.add(sku);

      const existingProd = existingSkuMap.get(sku);

      if (existingProd) {
        // If status column wasn't provided in CSV, preserve existing status
        if (!rawStatus) {
          active = existingProd.active;
        }

        const currentStock = existingProd.currentStock;
        const stockDifference = csvStock - currentStock;
        const costChanged = Math.abs(costPrice - existingProd.costPrice) > 0.0001;
        const sellingPriceChanged = Math.abs(sellingPrice - existingProd.sellingPrice) > 0.0001;
        const stockChanged = stockDifference !== 0;
        const nameChanged = name !== existingProd.name;
        const categoryChanged = (category || 'General') !== (existingProd.category || 'General');
        const minStockChanged = minimumStock !== existingProd.minimumStock;
        const activeChanged = active !== existingProd.active;

        const isUpdated =
          costChanged ||
          sellingPriceChanged ||
          stockChanged ||
          nameChanged ||
          categoryChanged ||
          minStockChanged ||
          activeChanged;

        const action: 'UPDATE' | 'UNCHANGED' = isUpdated ? 'UPDATE' : 'UNCHANGED';
        let reason = '';
        let stockNote = '';

        if (stockChanged) {
          stockNote =
            stockDifference > 0
              ? `Penyelarasan stok: +${stockDifference} unit (ADJUSTMENT)`
              : `Penyelarasan stok: ${stockDifference} unit (ADJUSTMENT)`;
        } else {
          stockNote = 'Stok tidak berubah (tiada pergerakan inventori)';
        }

        if (isUpdated) {
          const changes: string[] = [];
          if (nameChanged) changes.push(`nama (${existingProd.name} → ${name})`);
          if (costChanged) changes.push(`kos (RM${existingProd.costPrice.toFixed(2)} → RM${costPrice.toFixed(2)})`);
          if (sellingPriceChanged) changes.push(`harga jual (RM${existingProd.sellingPrice.toFixed(2)} → RM${sellingPrice.toFixed(2)})`);
          if (stockChanged) changes.push(`stok (${currentStock} → ${csvStock})`);
          if (categoryChanged) changes.push(`kategori (${existingProd.category} → ${category})`);
          if (minStockChanged) changes.push(`min stok (${existingProd.minimumStock} → ${minimumStock})`);
          if (activeChanged) changes.push(`status (${existingProd.active ? 'Aktif' : 'Tidak Aktif'} → ${active ? 'Aktif' : 'Tidak Aktif'})`);
          reason = `Katalog dikemas kini: ${changes.join(', ')}.`;
        } else {
          reason = 'Data katalog dan stok semasa sepadan sepenuhnya dengan fail CSV.';
        }

        rows.push({
          rowNumber,
          action,
          sku,
          name,
          category,
          costPrice,
          sellingPrice,
          csvStock,
          currentStock,
          stockDifference,
          minimumStock,
          active,
          reason,
          stockNote,
          existingProductId: existingProd.id,
          costChanged,
          sellingPriceChanged,
          stockChanged,
          rawRow: row,
        });
      } else {
        // Genuinely NEW product
        const stockNote =
          csvStock > 0
            ? `Pembukaan stok: ${csvStock} unit (STOCK_IN direkodkan)`
            : 'Tiada pembukaan stok (0 unit)';

        rows.push({
          rowNumber,
          action: 'NEW',
          sku,
          name,
          category,
          costPrice,
          sellingPrice,
          csvStock,
          currentStock: 0,
          stockDifference: csvStock,
          minimumStock,
          active,
          reason: 'Produk baharu - akan didaftarkan ke dalam katalog master.',
          stockNote,
          costChanged: true,
          sellingPriceChanged: true,
          stockChanged: csvStock > 0,
          rawRow: row,
        });
      }
    });

    // 2. Identify products in system NOT present in CSV (Section 15, 16, 17)
    const missingProducts: MasterSyncMissingProduct[] = [];
    existingProducts.forEach((p) => {
      const normSku = SmartInputService.normalizeCode(p.sku);
      if (!validCsvSkus.has(normSku)) {
        const eligibility = ProductService.checkDeleteEligibility(p, sales, purchases, movements);
        if (eligibility.hasHistoricalReferences) {
          missingProducts.push({
            product: p,
            action: 'DEACTIVATE',
            reason: 'Produk mempunyai rekod sejarah dan tiada dalam fail CSV. Dinyahaktifkan bagi mengekalkan rekod perniagaan.',
            hasHistoricalReferences: true,
          });
        } else {
          missingProducts.push({
            product: p,
            action: 'REMOVE',
            reason: 'Produk demo/ujian tanpa rekod sejarah dan tiada dalam fail CSV. Dikeluarkan dari katalog secara selamat.',
            hasHistoricalReferences: false,
          });
        }
      }
    });

    const newCount = rows.filter((r) => r.action === 'NEW').length;
    const updateCount = rows.filter((r) => r.action === 'UPDATE').length;
    const unchangedCount = rows.filter((r) => r.action === 'UNCHANGED').length;
    const invalidCount = rows.filter((r) => r.action === 'INVALID').length;
    const stockAdjustmentsCount =
      rows.filter((r) => r.action === 'UPDATE' && (r.stockDifference || 0) !== 0).length +
      rows.filter((r) => r.action === 'NEW' && r.csvStock > 0).length;
    const stockIncreaseCount = rows.filter(
      (r) => (r.action === 'UPDATE' || r.action === 'NEW') && (r.stockDifference || 0) > 0
    ).length;
    const stockDecreaseCount = rows.filter(
      (r) => r.action === 'UPDATE' && (r.stockDifference || 0) < 0
    ).length;
    const deactivatedCount = missingProducts.filter((m) => m.action === 'DEACTIVATE').length;
    const removedCount = missingProducts.filter((m) => m.action === 'REMOVE').length;

    return {
      totalRows: csvRows.length,
      newCount,
      updateCount,
      unchangedCount,
      stockAdjustmentsCount,
      stockIncreaseCount,
      stockDecreaseCount,
      invalidCount,
      missingProductsCount: missingProducts.length,
      deactivatedCount,
      removedCount,
      rows,
      missingProducts,
      errors,
      isValid: invalidCount === 0,
    };
  }
}

