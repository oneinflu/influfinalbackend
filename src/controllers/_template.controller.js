// TEMPLATE: Controller functions
// Controllers receive HTTP requests, call business logic (services/db), and send responses.
// Replace placeholders with your actual model imports and method implementations.

// import ModelName from '../models/ModelName.js';

// Example: Create a new document
export async function create(req, res, next) {
  try {
    // const doc = await ModelName.create(req.body);
    // return res.status(201).json(doc);
    return res.status(501).json({ message: 'Not implemented: create' });
  } catch (err) {
    // Forward error to centralized error handler if present
    next(err);
  }
}

// Example: List documents
export async function list(req, res, next) {
  try {
    // const docs = await ModelName.find();
    // return res.json(docs);
    return res.status(501).json({ message: 'Not implemented: list' });
  } catch (err) {
    next(err);
  }
}

// Example: Get one document by ID
export async function getById(req, res, next) {
  try {
    // const doc = await ModelName.findById(req.params.id);
    // if (!doc) return res.status(404).json({ message: 'Not found' });
    // return res.json(doc);
    return res.status(501).json({ message: 'Not implemented: getById' });
  } catch (err) {
    next(err);
  }
}

// Example: Update by ID
export async function updateById(req, res, next) {
  try {
    // const doc = await ModelName.findByIdAndUpdate(req.params.id, req.body, { new: true });
    // if (!doc) return res.status(404).json({ message: 'Not found' });
    // return res.json(doc);
    return res.status(501).json({ message: 'Not implemented: updateById' });
  } catch (err) {
    next(err);
  }
}

// Example: Delete by ID
export async function deleteById(req, res, next) {
  try {
    // const doc = await ModelName.findByIdAndDelete(req.params.id);
    // if (!doc) return res.status(404).json({ message: 'Not found' });
    // return res.status(204).send();
    return res.status(501).json({ message: 'Not implemented: deleteById' });
  } catch (err) {
    next(err);
  }
}