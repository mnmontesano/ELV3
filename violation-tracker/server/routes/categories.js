/**
 * Categories API Routes
 * Manage building categories
 */

const express = require('express');
const router = express.Router();
const db = require('../db');

/**
 * GET /api/categories
 * Get all categories with building counts
 */
router.get('/', (req, res) => {
    try {
        const categories = db.categories.getAll();
        
        // Add building counts to each category
        const enrichedCategories = categories.map(category => ({
            ...category,
            building_count: db.categories.getBuildingCount(category.id)
        }));
        
        // Also get uncategorized count
        const uncategorized = db.buildings.getUncategorized();
        
        res.json({
            categories: enrichedCategories,
            uncategorized_count: uncategorized.length
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/categories
 * Create a new category
 */
router.post('/', (req, res) => {
    try {
        const { name, color, icon } = req.body;
        
        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Category name is required' });
        }
        
        // Check if category already exists
        const existing = db.categories.getByName(name.trim());
        if (existing) {
            return res.status(400).json({ error: 'A category with this name already exists' });
        }
        
        const result = db.categories.add(name.trim(), color, icon);
        const newCategory = db.categories.getById(result.lastInsertRowid);
        
        res.status(201).json({
            message: 'Category created successfully',
            category: newCategory
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/categories/:id
 * Get a specific category with its buildings
 */
router.get('/:id', (req, res) => {
    try {
        const { id } = req.params;
        const category = db.categories.getById(id);
        
        if (!category) {
            return res.status(404).json({ error: 'Category not found' });
        }
        
        const buildings = db.buildings.getByCategory(id);
        
        res.json({
            ...category,
            buildings
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /api/categories/:id
 * Update a category
 */
router.put('/:id', (req, res) => {
    try {
        const { id } = req.params;
        const { name, color, icon } = req.body;
        
        const category = db.categories.getById(id);
        if (!category) {
            return res.status(404).json({ error: 'Category not found' });
        }
        
        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Category name is required' });
        }
        
        // Check if another category has this name
        const existing = db.categories.getByName(name.trim());
        if (existing && existing.id !== parseInt(id)) {
            return res.status(400).json({ error: 'A category with this name already exists' });
        }
        
        db.categories.update(id, name.trim(), color || category.color, icon || category.icon);
        const updated = db.categories.getById(id);
        
        res.json({
            message: 'Category updated successfully',
            category: updated
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/categories/:id
 * Delete a category (buildings will become uncategorized)
 */
router.delete('/:id', (req, res) => {
    try {
        const { id } = req.params;
        
        const category = db.categories.getById(id);
        if (!category) {
            return res.status(404).json({ error: 'Category not found' });
        }
        
        const buildingCount = db.categories.getBuildingCount(id);
        db.categories.remove(id);
        
        res.json({
            message: 'Category deleted successfully',
            buildings_uncategorized: buildingCount
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /api/categories/:id/order
 * Update category sort order
 */
router.put('/:id/order', (req, res) => {
    try {
        const { id } = req.params;
        const { sort_order } = req.body;
        
        const category = db.categories.getById(id);
        if (!category) {
            return res.status(404).json({ error: 'Category not found' });
        }
        
        db.categories.updateOrder(id, sort_order);
        
        res.json({ message: 'Category order updated' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
