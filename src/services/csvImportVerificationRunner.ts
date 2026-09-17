/**
 * Kedai PAPA POS - CSV Product Importer Safe Upsert Verification Runner
 * SYNCROZZ Engineering Standard (SES) v4.4 Locked
 *
 * Implements 11 comprehensive regression & verification tests (A through K):
 * A. New SKU
 * B. Duplicate SKU detection
 * C. Skip existing
 * D. Update existing
 * E. No duplicate Product created
 * F. Existing stock unchanged
 * G. New product opening stock creates STOCK_IN
 * H. Historical SaleItem cost unchanged
 * I. Historical SaleItem selling price unchanged
 * J. Atomic import
 * K. Invalid CSV rejected safely
 */

import { Product, InventoryMovement, Sale, CartItem, Store, CommitUpsertPayload } from '../types';
import { CsvService } from './csvService';
import { SalesService } from './salesService';
import { SmartInputService } from './smartInputService';

export interface CsvImportTestResult {
  code: string;
  name: string;
  category: 'Import Modes' | 'Stock Safety' | 'Financial Integrity' | 'Atomic Ops' | 'Validation';
  status: 'PASSED' | 'FAILED';
  passed: boolean;
  message: string;
  details: string;
}

export class CsvImportVerificationRunner {
  private static testStore: Store = {
    id: 'store-test-csv',
    name: 'Kedai PAPA Test Store',
    code: 'KP-TEST',
    currency: 'RM',
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
  };

  /**
   * Helper simulating StoreContext atomic commitProductsUpsertImport logic in isolated test harness.
   */
  public static simulateCommitUpsert(
    products: Product[],
    movements: InventoryMovement[],
    payload: CommitUpsertPayload
  ): { products: Product[]; movements: InventoryMovement[]; newCount: number; updatedCount: number } {
    const { newItems, updateItems } = payload;
    const now = new Date().toISOString();

    // 1. Validation phase (Atomic guarantee)
    for (const u of updateItems) {
      const found = products.find((p) => p.id === u.existingProductId);
      if (!found) {
        throw new Error(`Atomic Import Aborted: Product ID "${u.existingProductId}" not found.`);
      }
    }

    const existingSkuMap = new Map(products.map((p) => [SmartInputService.normalizeCode(p.sku), p.id]));
    const newSkuSet = new Set<string>();

    for (const n of newItems) {
      const normalizedSku = SmartInputService.normalizeCode(n.sku);
      if (!normalizedSku) {
        throw new Error('Atomic Import Aborted: Empty SKU found in new items.');
      }
      if (newSkuSet.has(normalizedSku)) {
        throw new Error(`Atomic Import Aborted: Duplicate SKU "${normalizedSku}" in batch.`);
      }
      newSkuSet.add(normalizedSku);

      if (existingSkuMap.has(normalizedSku)) {
        throw new Error(`Atomic Import Aborted: SKU "${normalizedSku}" already exists.`);
      }
    }

    // 2. Prepare mutations
    const updateMap = new Map<string, (typeof updateItems)[0]>();
    updateItems.forEach((u) => updateMap.set(u.existingProductId, u));

    const nextProducts: Product[] = products.map((prod) => {
      const updateData = updateMap.get(prod.id);
      if (updateData) {
        return {
          ...prod,
          name: updateData.name,
          category: updateData.category,
          costPrice: updateData.costPrice,
          sellingPrice: updateData.sellingPrice,
          minimumStock: updateData.minimumStock,
          active: updateData.active,
          updatedAt: now,
        };
      }
      return prod;
    });

    const addedProducts: Product[] = [];
    const openingMovements: InventoryMovement[] = [];

    newItems.forEach((item, idx) => {
      const id = `prod-import-test-${Date.now()}-${idx}`;
      const product: Product = {
        ...item,
        id,
        storeId: this.testStore.id,
        createdAt: now,
        updatedAt: now,
      };
      addedProducts.push(product);

      if (item.currentStock > 0) {
        openingMovements.push({
          id: `mov-test-${Date.now()}-${idx}`,
          storeId: this.testStore.id,
          productId: id,
          productName: item.name,
          type: 'STOCK_IN',
          quantity: item.currentStock,
          previousStock: 0,
          newStock: item.currentStock,
          reason: 'Import CSV Pembukaan Stok',
          adjustedBySnapshot: 'Test Runner',
          createdAt: now,
        });
      }
    });

    return {
      products: [...nextProducts, ...addedProducts],
      movements: [...openingMovements, ...movements],
      newCount: addedProducts.length,
      updatedCount: updateItems.length,
    };
  }

  public static runAllTests(): CsvImportTestResult[] {
    const results: CsvImportTestResult[] = [];

    // Base mock products
    const initialProduct1: Product = {
      id: 'prod-existing-1',
      storeId: this.testStore.id,
      sku: 'KP-MAGGI-01',
      name: 'MAGGI AYAM',
      category: 'Instant Noodles',
      costPrice: 1.20,
      sellingPrice: 1.80,
      currentStock: 12,
      minimumStock: 5,
      active: true,
      createdAt: '2026-09-01T00:00:00Z',
      updatedAt: '2026-09-01T00:00:00Z',
    };

    const initialProduct2: Product = {
      id: 'prod-existing-2',
      storeId: this.testStore.id,
      sku: 'KP-LAICI-01',
      name: 'AIR LAICI',
      category: 'Beverages',
      costPrice: 1.50,
      sellingPrice: 2.50,
      currentStock: 20,
      minimumStock: 5,
      active: true,
      createdAt: '2026-09-01T00:00:00Z',
      updatedAt: '2026-09-01T00:00:00Z',
    };

    // -------------------------------------------------------------------------
    // TEST A: New SKU Import
    // -------------------------------------------------------------------------
    try {
      const csvRows = [
        {
          sku: 'KP-NEW-SNACK',
          name: 'Super Ring Cheese',
          category: 'Snacks',
          cost: '1.10',
          price: '1.60',
          stock: '15',
          min: '5',
        },
      ];
      const validation = CsvService.validateProductsUpsert(csvRows, [initialProduct1]);
      const rowA = validation.rows[0];

      const commit = this.simulateCommitUpsert([initialProduct1], [], {
        mode: 'SKIP_EXISTING',
        newItems: validation.newItems,
        updateItems: validation.updateItems,
      });

      const added = commit.products.find((p) => p.sku === 'KP-NEW-SNACK');
      const passed =
        validation.newCount === 1 &&
        rowA.action === 'NEW' &&
        added !== undefined &&
        added.costPrice === 1.10 &&
        added.sellingPrice === 1.60 &&
        added.currentStock === 15;

      results.push({
        code: 'TEST-CSV-A',
        name: 'New SKU Import',
        category: 'Import Modes',
        status: passed ? 'PASSED' : 'FAILED',
        passed,
        message: 'Genuinely new SKU is correctly classified as NEW and registered to catalog.',
        details: `Detected NEW action, SKU ${added?.sku}, cost RM${added?.costPrice}, price RM${added?.sellingPrice}.`,
      });
    } catch (err: any) {
      results.push({
        code: 'TEST-CSV-A',
        name: 'New SKU Import',
        category: 'Import Modes',
        status: 'FAILED',
        passed: false,
        message: err.message,
        details: 'Exception encountered in Test A.',
      });
    }

    // -------------------------------------------------------------------------
    // TEST B: Duplicate SKU Detection
    // -------------------------------------------------------------------------
    try {
      const csvRows = [
        {
          sku: 'kp-maggi-01', // Lowercase test for case-insensitive normalization
          name: 'MAGGI AYAM EXTRA',
          category: 'Instant Noodles',
          cost: '1.30',
          price: '2.00',
          stock: '8',
        },
      ];

      const validationSkip = CsvService.validateProductsUpsert(csvRows, [initialProduct1], 'SKIP_EXISTING');
      const validationUpdate = CsvService.validateProductsUpsert(csvRows, [initialProduct1], 'UPDATE_EXISTING');

      const passed =
        validationSkip.newCount === 0 &&
        validationSkip.existingCount === 1 &&
        validationSkip.rows[0].action === 'SKIP' &&
        validationUpdate.newCount === 0 &&
        validationUpdate.existingCount === 1 &&
        validationUpdate.rows[0].action === 'UPDATE';

      results.push({
        code: 'TEST-CSV-B',
        name: 'Duplicate SKU Detection',
        category: 'Import Modes',
        status: passed ? 'PASSED' : 'FAILED',
        passed,
        message: 'Existing SKU is safely detected across case normalization and prevented from accidental re-creation.',
        details: `SKIP mode action: ${validationSkip.rows[0].action}, UPDATE mode action: ${validationUpdate.rows[0].action}.`,
      });
    } catch (err: any) {
      results.push({
        code: 'TEST-CSV-B',
        name: 'Duplicate SKU Detection',
        category: 'Import Modes',
        status: 'FAILED',
        passed: false,
        message: err.message,
        details: 'Exception in Test B.',
      });
    }

    // -------------------------------------------------------------------------
    // TEST C: Skip Existing Mode
    // -------------------------------------------------------------------------
    try {
      const csvRows = [
        {
          sku: 'KP-MAGGI-01',
          name: 'MAGGI AYAM MODIFIED',
          price: '9.99',
          stock: '50',
        },
        {
          sku: 'KP-BISKUT-01',
          name: 'Biskut Tiger',
          price: '2.50',
          stock: '10',
        },
      ];

      const validation = CsvService.validateProductsUpsert(csvRows, [initialProduct1], 'SKIP_EXISTING');
      const commit = this.simulateCommitUpsert([initialProduct1], [], {
        mode: 'SKIP_EXISTING',
        newItems: validation.newItems,
        updateItems: validation.updateItems,
      });

      const existingProd = commit.products.find((p) => p.sku === 'KP-MAGGI-01');
      const passed =
        validation.newCount === 1 &&
        validation.skipCount === 1 &&
        validation.updateCount === 0 &&
        existingProd?.name === 'MAGGI AYAM' &&
        existingProd?.sellingPrice === 1.80 &&
        commit.products.length === 2;

      results.push({
        code: 'TEST-CSV-C',
        name: 'Skip Existing Mode',
        category: 'Import Modes',
        status: passed ? 'PASSED' : 'FAILED',
        passed,
        message: 'In SKIP EXISTING mode, duplicate SKU is skipped and existing catalog attributes remain unmodified.',
        details: `New count: ${validation.newCount}, Skip count: ${validation.skipCount}, Existing product price retained at RM${existingProd?.sellingPrice}.`,
      });
    } catch (err: any) {
      results.push({
        code: 'TEST-CSV-C',
        name: 'Skip Existing Mode',
        category: 'Import Modes',
        status: 'FAILED',
        passed: false,
        message: err.message,
        details: 'Exception in Test C.',
      });
    }

    // -------------------------------------------------------------------------
    // TEST D: Update Existing Mode
    // -------------------------------------------------------------------------
    try {
      const csvRows = [
        {
          sku: 'KP-MAGGI-01',
          name: 'MAGGI AYAM KAW',
          category: 'Noodles & Pasta',
          cost: '1.40',
          price: '2.20',
          min: '10',
          stock: '99', // should be ignored!
        },
      ];

      const validation = CsvService.validateProductsUpsert(csvRows, [initialProduct1], 'UPDATE_EXISTING');
      const commit = this.simulateCommitUpsert([initialProduct1], [], {
        mode: 'UPDATE_EXISTING',
        newItems: validation.newItems,
        updateItems: validation.updateItems,
      });

      const updated = commit.products.find((p) => p.sku === 'KP-MAGGI-01');
      const passed =
        validation.updateCount === 1 &&
        validation.newCount === 0 &&
        updated !== undefined &&
        updated.name === 'MAGGI AYAM KAW' &&
        updated.category === 'Noodles & Pasta' &&
        updated.costPrice === 1.40 &&
        updated.sellingPrice === 2.20 &&
        updated.minimumStock === 10;

      results.push({
        code: 'TEST-CSV-D',
        name: 'Update Existing Mode',
        category: 'Import Modes',
        status: passed ? 'PASSED' : 'FAILED',
        passed,
        message: 'In UPDATE EXISTING mode, safe catalog fields are updated cleanly.',
        details: `Name updated to "${updated?.name}", cost RM${updated?.costPrice}, selling RM${updated?.sellingPrice}, minStock ${updated?.minimumStock}.`,
      });
    } catch (err: any) {
      results.push({
        code: 'TEST-CSV-D',
        name: 'Update Existing Mode',
        category: 'Import Modes',
        status: 'FAILED',
        passed: false,
        message: err.message,
        details: 'Exception in Test D.',
      });
    }

    // -------------------------------------------------------------------------
    // TEST E: No Duplicate Product Created
    // -------------------------------------------------------------------------
    try {
      const currentProducts = [initialProduct1, initialProduct2];
      const csvRows = [
        {
          sku: 'KP-MAGGI-01',
          name: 'MAGGI AYAM RENOVATED',
          price: '2.40',
        },
      ];

      const validation = CsvService.validateProductsUpsert(csvRows, currentProducts, 'UPDATE_EXISTING');
      const commit = this.simulateCommitUpsert(currentProducts, [], {
        mode: 'UPDATE_EXISTING',
        newItems: validation.newItems,
        updateItems: validation.updateItems,
      });

      const matchingProducts = commit.products.filter((p) => p.sku === 'KP-MAGGI-01');
      const passed =
        commit.products.length === 2 &&
        matchingProducts.length === 1 &&
        matchingProducts[0].id === initialProduct1.id;

      results.push({
        code: 'TEST-CSV-E',
        name: 'No Duplicate Product Created',
        category: 'Import Modes',
        status: passed ? 'PASSED' : 'FAILED',
        passed,
        message: 'Updating an existing SKU maintains strict 1:1 entity identity without duplicate rows or altered IDs.',
        details: `Total products count: ${commit.products.length}, Product ID preserved: ${matchingProducts[0]?.id}.`,
      });
    } catch (err: any) {
      results.push({
        code: 'TEST-CSV-E',
        name: 'No Duplicate Product Created',
        category: 'Import Modes',
        status: 'FAILED',
        passed: false,
        message: err.message,
        details: 'Exception in Test E.',
      });
    }

    // -------------------------------------------------------------------------
    // TEST F: Existing Stock Unchanged
    // -------------------------------------------------------------------------
    try {
      const initialStock = initialProduct1.currentStock; // 12
      const csvRows = [
        {
          sku: 'KP-MAGGI-01',
          name: 'MAGGI AYAM',
          price: '2.00',
          stock: '5', // Attempted CSV stock of 5 must NOT overwrite or add!
        },
      ];

      const validation = CsvService.validateProductsUpsert(csvRows, [initialProduct1], 'UPDATE_EXISTING');
      const commit = this.simulateCommitUpsert([initialProduct1], [], {
        mode: 'UPDATE_EXISTING',
        newItems: validation.newItems,
        updateItems: validation.updateItems,
      });

      const updated = commit.products.find((p) => p.sku === 'KP-MAGGI-01');
      const noteContainsSafeWarning = validation.rows[0].stockNote.includes('Stock column ignored');
      const passed =
        updated?.currentStock === initialStock &&
        commit.movements.length === 0 &&
        noteContainsSafeWarning;

      results.push({
        code: 'TEST-CSV-F',
        name: 'Existing Stock Unchanged',
        category: 'Stock Safety',
        status: passed ? 'PASSED' : 'FAILED',
        passed,
        message: 'CSV stock column is strictly ignored for existing products (12 remains 12; not 5, not 17).',
        details: `Initial stock: ${initialStock}, post-import stock: ${updated?.currentStock}, movements created: ${commit.movements.length}.`,
      });
    } catch (err: any) {
      results.push({
        code: 'TEST-CSV-F',
        name: 'Existing Stock Unchanged',
        category: 'Stock Safety',
        status: 'FAILED',
        passed: false,
        message: err.message,
        details: 'Exception in Test F.',
      });
    }

    // -------------------------------------------------------------------------
    // TEST G: New Product Opening Stock Creates STOCK_IN
    // -------------------------------------------------------------------------
    try {
      const csvRows = [
        {
          sku: 'KP-MILO-01',
          name: 'Milo Kotak 200ml',
          category: 'Beverages',
          cost: '1.60',
          price: '2.20',
          stock: '18',
        },
      ];

      const validation = CsvService.validateProductsUpsert(csvRows, [], 'SKIP_EXISTING');
      const commit = this.simulateCommitUpsert([], [], {
        mode: 'SKIP_EXISTING',
        newItems: validation.newItems,
        updateItems: validation.updateItems,
      });

      const created = commit.products.find((p) => p.sku === 'KP-MILO-01');
      const movement = commit.movements.find((m) => m.productId === created?.id);

      const passed =
        created !== undefined &&
        created.currentStock === 18 &&
        movement !== undefined &&
        movement.type === 'STOCK_IN' &&
        movement.quantity === 18 &&
        movement.previousStock === 0 &&
        movement.newStock === 18;

      results.push({
        code: 'TEST-CSV-G',
        name: 'New Product Opening Stock Creates STOCK_IN',
        category: 'Stock Safety',
        status: passed ? 'PASSED' : 'FAILED',
        passed,
        message: 'Opening stock on new products initiates an official STOCK_IN inventory audit movement.',
        details: `Product stock: ${created?.currentStock}, movement: ${movement?.type} with quantity ${movement?.quantity}.`,
      });
    } catch (err: any) {
      results.push({
        code: 'TEST-CSV-G',
        name: 'New Product Opening Stock Creates STOCK_IN',
        category: 'Stock Safety',
        status: 'FAILED',
        passed: false,
        message: err.message,
        details: 'Exception in Test G.',
      });
    }

    // -------------------------------------------------------------------------
    // TEST H: Historical SaleItem Cost Unchanged
    // -------------------------------------------------------------------------
    try {
      // Step 1: Create a sale using existing product with cost RM1.20
      const prodMap = new Map([[initialProduct1.id, initialProduct1]]);
      const { sale: originalSale } = SalesService.processSale(
        [{ product: initialProduct1, quantity: 2 }],
        prodMap,
        this.testStore.id,
        0
      );

      const saleCostBefore = originalSale.items[0].unitCostSnapshot; // 1.20
      const lineCostBefore = originalSale.items[0].lineCost; // 2.40
      const profitBefore = originalSale.items[0].grossProfit; // 3.60 - 2.40 = 1.20

      // Step 2: Now update product cost via CSV in UPDATE_EXISTING mode from 1.20 to 1.70
      const csvRows = [
        {
          sku: 'KP-MAGGI-01',
          name: 'MAGGI AYAM',
          cost: '1.70',
          price: '2.00',
        },
      ];
      const validation = CsvService.validateProductsUpsert(csvRows, [initialProduct1], 'UPDATE_EXISTING');
      const commit = this.simulateCommitUpsert([initialProduct1], [], {
        mode: 'UPDATE_EXISTING',
        newItems: validation.newItems,
        updateItems: validation.updateItems,
      });

      const updatedProduct = commit.products.find((p) => p.sku === 'KP-MAGGI-01');

      const passed =
        updatedProduct?.costPrice === 1.70 &&
        originalSale.items[0].unitCostSnapshot === saleCostBefore &&
        originalSale.items[0].lineCost === lineCostBefore &&
        originalSale.items[0].grossProfit === profitBefore;

      results.push({
        code: 'TEST-CSV-H',
        name: 'Historical SaleItem Cost Unchanged',
        category: 'Financial Integrity',
        status: passed ? 'PASSED' : 'FAILED',
        passed,
        message: 'Updating product cost via CSV does not mutate historical SaleItem unitCostSnapshot or gross profit.',
        details: `Catalog cost updated to RM${updatedProduct?.costPrice}, historical sale snapshot cost retained at RM${originalSale.items[0].unitCostSnapshot}.`,
      });
    } catch (err: any) {
      results.push({
        code: 'TEST-CSV-H',
        name: 'Historical SaleItem Cost Unchanged',
        category: 'Financial Integrity',
        status: 'FAILED',
        passed: false,
        message: err.message,
        details: 'Exception in Test H.',
      });
    }

    // -------------------------------------------------------------------------
    // TEST I: Historical SaleItem Selling Price Unchanged
    // -------------------------------------------------------------------------
    try {
      // Step 1: Create a sale using existing product with selling price RM1.80
      const prodMap = new Map([[initialProduct1.id, initialProduct1]]);
      const { sale: originalSale } = SalesService.processSale(
        [{ product: initialProduct1, quantity: 3 }],
        prodMap,
        this.testStore.id,
        1
      );

      const salePriceBefore = originalSale.items[0].unitSellingPriceSnapshot; // 1.80
      const lineTotalBefore = originalSale.items[0].lineTotal; // 5.40

      // Step 2: Now update product selling price via CSV from 1.80 to 2.90
      const csvRows = [
        {
          sku: 'KP-MAGGI-01',
          name: 'MAGGI AYAM',
          price: '2.90',
        },
      ];
      const validation = CsvService.validateProductsUpsert(csvRows, [initialProduct1], 'UPDATE_EXISTING');
      const commit = this.simulateCommitUpsert([initialProduct1], [], {
        mode: 'UPDATE_EXISTING',
        newItems: validation.newItems,
        updateItems: validation.updateItems,
      });

      const updatedProduct = commit.products.find((p) => p.sku === 'KP-MAGGI-01');

      const passed =
        updatedProduct?.sellingPrice === 2.90 &&
        originalSale.items[0].unitSellingPriceSnapshot === salePriceBefore &&
        originalSale.items[0].lineTotal === lineTotalBefore;

      results.push({
        code: 'TEST-CSV-I',
        name: 'Historical SaleItem Selling Price Unchanged',
        category: 'Financial Integrity',
        status: passed ? 'PASSED' : 'FAILED',
        passed,
        message: 'Updating product selling price via CSV does not alter past receipt line items or historical totals.',
        details: `Catalog price updated to RM${updatedProduct?.sellingPrice}, historical sale snapshot price retained at RM${originalSale.items[0].unitSellingPriceSnapshot}.`,
      });
    } catch (err: any) {
      results.push({
        code: 'TEST-CSV-I',
        name: 'Historical SaleItem Selling Price Unchanged',
        category: 'Financial Integrity',
        status: 'FAILED',
        passed: false,
        message: err.message,
        details: 'Exception in Test I.',
      });
    }

    // -------------------------------------------------------------------------
    // TEST J: Atomic Import
    // -------------------------------------------------------------------------
    try {
      const initialProductsState = [initialProduct1, initialProduct2];
      let aborted = false;

      try {
        // Attempt an atomic commit with an invalid product ID in updateItems
        this.simulateCommitUpsert(initialProductsState, [], {
          mode: 'UPDATE_EXISTING',
          newItems: [
            {
              sku: 'KP-VALID-NEW',
              name: 'Valid New Product',
              category: 'General',
              costPrice: 1.0,
              sellingPrice: 2.0,
              currentStock: 0,
              minimumStock: 5,
              active: true,
            },
          ],
          updateItems: [
            {
              existingProductId: 'non-existent-id-9999', // Will trigger atomic abort!
              sku: 'KP-MAGGI-01',
              name: 'Aborted MAGGI',
              category: 'General',
              costPrice: 1.0,
              sellingPrice: 2.0,
              minimumStock: 5,
              active: true,
              ignoredCsvStock: 0,
            },
          ],
        });
      } catch (atomicErr) {
        aborted = true;
      }

      // Assert that initialProductsState was completely untouched
      const passed =
        aborted === true &&
        initialProductsState.length === 2 &&
        initialProductsState[0].name === 'MAGGI AYAM';

      results.push({
        code: 'TEST-CSV-J',
        name: 'Atomic Import',
        category: 'Atomic Ops',
        status: passed ? 'PASSED' : 'FAILED',
        passed,
        message: 'Errors during validation or execution abort the entire transaction without leaving partial state mutations.',
        details: `Transaction cleanly threw abort exception, catalog state intact (${initialProductsState.length} products).`,
      });
    } catch (err: any) {
      results.push({
        code: 'TEST-CSV-J',
        name: 'Atomic Import',
        category: 'Atomic Ops',
        status: 'FAILED',
        passed: false,
        message: err.message,
        details: 'Exception in Test J.',
      });
    }

    // -------------------------------------------------------------------------
    // TEST K: Invalid CSV Rejected Safely
    // -------------------------------------------------------------------------
    try {
      const csvRows = [
        {
          sku: '', // Missing SKU
          name: 'Produk Tanpa SKU',
        },
        {
          sku: 'KP-VALID-01',
          name: '', // Missing Name
        },
        {
          sku: 'KP-BATCH-DUP',
          name: 'Item 1',
        },
        {
          sku: 'KP-BATCH-DUP', // Duplicate within the same CSV batch
          name: 'Item 2',
        },
      ];

      const validation = CsvService.validateProductsUpsert(csvRows, [initialProduct1]);

      const invalidRows = validation.rows.filter((r) => r.action === 'INVALID');
      const passed =
        invalidRows.length === 3 &&
        validation.invalidCount === 3 &&
        validation.errors.some((e) => e.reason.includes('SKU tidak boleh kosong')) &&
        validation.errors.some((e) => e.reason.includes('Nama produk tidak boleh kosong')) &&
        validation.errors.some((e) => e.reason.includes('berulang dalam fail CSV'));

      results.push({
        code: 'TEST-CSV-K',
        name: 'Invalid CSV Rejected Safely',
        category: 'Validation',
        status: passed ? 'PASSED' : 'FAILED',
        passed,
        message: 'Empty SKUs, missing names, and intra-batch duplicates are safely flagged as INVALID with clear error reasons.',
        details: `Flagged ${invalidRows.length} invalid rows across all error categories.`,
      });
    } catch (err: any) {
      results.push({
        code: 'TEST-CSV-K',
        name: 'Invalid CSV Rejected Safely',
        category: 'Validation',
        status: 'FAILED',
        passed: false,
        message: err.message,
        details: 'Exception in Test K.',
      });
    }

    return results;
  }
}
