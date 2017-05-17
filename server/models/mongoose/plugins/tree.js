

const mongoose = require('mongoose');
const streamWorker = require('stream-worker');
const Promise = require('bluebird');

module.exports = exports = tree;

/**
 * @class Tree
 * Tree Behavior for Mongoose
 *
 * Implements the materialized path strategy with cascade child re-parenting
 * on delete for storing a hierarchy of documents with Mongoose
 *
 * @param  {Mongoose.Schema} schema
 * @param  {Object} options
 */
function tree(schema, options) {
  const pathSeparator = options && options.pathSeparator || '#',
    wrapChildrenTree = options && options.wrapChildrenTree,
    onDelete = options && options.onDelete || 'DELETE', // 'REPARENT'
    numWorkers = options && options.numWorkers || 5,
    idType = options && options.idType || mongoose.Schema.ObjectId,
    pathSeparatorRegex = `[${pathSeparator}]`;

    /**
     * Add parent and path properties
     *
     * @property {ObjectID} parent
     * @property {String} path
     */
  schema.add({
    parent: {
      type: idType,
      set(val) {
        return (val instanceof Object && val._id) ? val._id : val;
      },
      index: true,
    },
    path: {
      type: String,
      index: true,
    },
  });


    /**
     * Pre-save middleware
     * Build or rebuild path when needed
     *
     * @param  {Function} next
     */
  schema.pre('save', function preSave(next) {
    const isParentChange = this.isModified('parent');

    if (this.isNew || isParentChange) {
      if (!this.parent) {
        this.path = this._id.toString();
        return next();
      }

      const self = this;
      this.collection.findOne({ _id: this.parent }, (err, doc) => {
        if (err) {
          return next(err);
        }

        const previousPath = self.path;
        self.path = doc.path + pathSeparator + self._id.toString();

        if (isParentChange) {
          // When the parent is changed we must rewrite all children paths as well
          self.collection.find({ path: { $regex: `^${previousPath}${pathSeparatorRegex}` } }, (err, cursor) => {
            if (err) {
              return next(err);
            }

            return streamWorker(cursor.stream(), (doc, done) => {
              const newPath = self.path + doc.path.substr(previousPath.length);
              self.collection.update({ _id: doc._id }, { $set: { path: newPath } }, done);
            }, numWorkers, next);
          });
        }
        return next();
      });
    }
    return next();
  });


    /**
     * Pre-remove middleware
     *
     * @param  {Function} next
     */
  schema.pre('remove', function preRemove(next) {
    if (!this.path) { return next(); }

    if (onDelete === 'DELETE') {
      return this.collection.remove({ path: { $regex: `^${this.path}${pathSeparatorRegex}` } }, next);
    } else {
      const self = this,
        newParent = this.parent,
        previousParent = this._id;

            // Update parent property from children
      return this.collection.find({ parent: previousParent }, (err, cursor) => {
        if (err) {
          return next(err);
        }

        return streamWorker(cursor.stream(), (doc, done) => {
          self.collection.update({ _id: doc._id }, { $set: { parent: newParent } }, done);
        }, numWorkers,
                (err) => {
                  if (err) {
                    return next(err);
                  }

                  return self.collection.find({ path: { $regex: previousParent + pathSeparatorRegex } }, (err, cursor) => {
                    const subStream = cursor.stream();
                    streamWorker(subStream, numWorkers, (doc, done) => {
                      const newPath = doc.path.replace(previousParent + pathSeparator, '');
                      self.collection.update({ _id: doc._id }, { $set: { path: newPath } }, done);
                    },
                        next);
                  });
                });
      });
    }
  });


    /**
     * @method getChildren
     *
     *         {Object}        filters (like for mongo find) (optional)
     *  {Object} or {String}   fields  (like for mongo find) (optional)
     *         {Object}        options (like for mongo find) (optional)
     * @param  {Boolean}       recursive, default false      (optional)
     * @param  {Function}      next
     * @return {Model}
     */
  schema.methods.getChildren = function getChildren(filters, fields, options, recursive, next) {
    // const fn = (filters, fields, options, recursive, next) => {
            // normalize the arguments
    if (typeof filters === 'function') {
      next = filters;
      filters = {};
    } else if (typeof filters === 'boolean') {
      recursive = filters;
      filters = null;
    } else if (typeof fields === 'function') {
      next = fields;
      fields = null;

      if (typeof filters === 'boolean') {
        recursive = filters;
        filters = {};
      }
    } else if (typeof options === 'function') {
      next = options;
      options = {};

      if (typeof fields === 'boolean') {
        recursive = fields;
        fields = null;
      }
    } else if (typeof recursive === 'function') {
      next = recursive;

      if (typeof options === 'boolean') {
        recursive = options;
        options = {};
      } else {
        recursive = false;
      }
    }

    filters = filters || {};
    fields = fields || null;
    options = options || {};
    recursive = recursive || false;

    if (recursive) {
      if (filters.$query) {
        filters.$query.path = { $regex: `^${this.path}${pathSeparatorRegex}` };
      } else {
        filters.path = { $regex: `^${this.path}${pathSeparatorRegex}` };
      }
    } else if (filters.$query) {
      filters.$query.parent = this._id;
    } else {
      filters.parent = this._id;
    }

    return this.model(this.constructor.modelName).find(filters, fields, options, (err, result) => {
      if (next instanceof Function) {
        if (err) {
          return next(err);
        }
        return next(null, result);
      }
      if (err) { return Promise.reject(err); }
      return Promise.resolve(result);
    });
   // };

    /*
    if (next instanceof Function) {
      return fn(filters, fields, options, recursive, next);
    }

    const promise = new Promise(function(resolve, reject) {
      fn((err, result) => {
        if (err) { return reject(err); }
        resolve(result);
      });
    });
    promise.exec = fn;
    return promise;
    */
  };

  schema.methods.getLeaves = function getLeaves(filters, fields, options, next) {
    return this.getChildren(filters, fields, options, true).then((children) => {
      const paths = children.map(e => e.path);

      const leaves = children.filter((o) => {
        const path = o.path;

        const childPaths = paths.filter(e => e.indexOf(path + pathSeparator) === 0);

        return !childPaths.length > 0;
      });

      if (next instanceof Function) {
        return next(null, leaves);
      }
      return Promise.resolve(leaves);
    }).catch((err) => {
      if (next instanceof Function) {
        if (err) { return next(err); }
        return next(err);
      }
      return Promise.reject(err);
    });
  };

    /**
     * @method getParent
     *
     * @param  {Function} next
     * @return {Model}
     */
  schema.methods.getParent = function getParent(next) {
    return this.model(this.constructor.modelName).findOne({ _id: this.parent }, (err, result) => {
      if (next instanceof Function) {
        if (err) { return next(err); }
        return next(null, result);
      }
      if (err) { return Promise.reject(err); }
      return Promise.resolve(result);
    });
  };

    /**
     * @method getAncestors
     *
     * @param  {Object}   args
     * @param  {Function} next
     * @return {Model}
     */
  schema.methods.getAncestors = function getAncestors(filters, fields, options, next) {
    if (typeof filters === 'function') {
      next = filters;
      filters = {};
    } else if (typeof fields === 'function') {
      next = fields;
      fields = null;
    } else if (typeof options === 'function') {
      next = options;
      options = {};
    }

    filters = filters || {};
    fields = fields || null;
    options = options || {};

    let ids = [];

    if (this.path) {
      ids = this.path.split(pathSeparator);
      ids.pop();
    }

    if (filters.$query) {
      filters.$query._id = { $in: ids };
    } else {
      filters._id = { $in: ids };
    }

    return this.model(this.constructor.modelName).find(filters, fields, options, next);
  };

  schema.methods.getNestedField = function getNestedField(field, seperator, cb) {
    const fn = (next) => {
      const signForNoField = seperator === '#' ? '-' : '#';

      if (typeof seperator === 'function') {
        next = seperator;
      }

      let nfield = '';
      const that = this;
      seperator = seperator || '.';
      return this.getAncestors((err, ancestors) => {
        ancestors.forEach((e) => {
          const node = e[field] || signForNoField;
          nfield += node + seperator;
        });
        nfield += that[field];
        return next(null, nfield);
      });
    };

    if (cb instanceof Function) {
      return fn(field, seperator, cb);
    }

    const promise = Promise.promisify(fn);
    promise.exec = fn;
    return promise;
  };

    /**
     * @method getChildrenTree
     *
     * @param  {Document} root (optional)
     * @param  {Object}   args (optional)
     *         {Object}        .filters (like for mongo find)
     *  {Object} or {String}   .fields  (like for mongo find)
     *         {Object}        .options (like for mongo find)
     *         {Number}        .minLevel, default 1
     *         {Boolean}       .recursive
     *         {Boolean}       .allowEmptyChildren
     * @param  {Function} next
     * @return {Model}
     */
  schema.statics.getChildrenTree = function getChildrenTree(root, args, next) {
    if (typeof (root) === 'function') {
      next = root;
      root = null;
      args = {};
    } else if (typeof (args) === 'function') {
      next = args;

      if ('model' in root) {
        args = {};
      } else {
        args = root;
        root = null;
      }
    }

    const filters = args.filters || {};
    let fields = args.fields || null;
    const options = args.options || {};
    let minLevel = args.minLevel || 1;
    const recursive = args.recursive !== undefined ? args.recursive : true;
    const allowEmptyChildren = args.allowEmptyChildren !== undefined ? args.allowEmptyChildren : true;

    if (!next) { throw new Error('no callback defined when calling getChildrenTree'); }

        // filters: Add recursive path filter or not
    if (recursive) {
      if (root) {
        filters.path = { $regex: `^${root.path}${pathSeparatorRegex}` };
      }

      if (filters.parent === null) {
        delete filters.parent;
      }
    } else if (root) {
      filters.parent = root._id;
    } else {
      filters.parent = null;
    }

        // fields: Add path and parent in the result if not already specified
    if (fields) {
      if (fields instanceof Object) {
        if (!fields.hasOwnProperty('path')) {
          fields.path = 1;
        }
        if (!fields.hasOwnProperty('parent')) {
          fields.parent = 1;
        }
      } else {
        if (!fields.match(/path/)) {
          fields += ' path';
        }
        if (!fields.match(/parent/)) {
          fields += ' parent';
        }
      }
    }

        // options:sort , path sort is mandatory
    if (!options.sort) {
      options.sort = {};
    }
    options.sort.path = 1;

    if (options.lean == null) {
      options.lean = !wrapChildrenTree;
    }

    return this.find(filters, fields, options, (err, results) => {
      if (err) {
        return next(err);
      }

      const getLevel = function (path) {
        return path ? path.split(pathSeparator).length : 0;
      };

      const createChildren = function createChildren(arr, node, level) {
        if (level === minLevel) {
          if (allowEmptyChildren) {
            node.children = [];
          }
          return arr.push(node);
        }

        const nextIndex = arr.length - 1;
        const myNode = arr[nextIndex];

        if (!myNode) {
                    // console.log("Tree node " + node.name + " filtered out. Level: " + level + " minLevel: " + minLevel);
          return [];
        }
        return createChildren(myNode.children, node, level - 1);
      };

      const finalResults = [];
      let rootLevel = 1;

      if (root) {
        rootLevel = getLevel(root.path) + 1;
      }

      if (minLevel < rootLevel) {
        minLevel = rootLevel;
      }

      for (const r of results) {
        const level = getLevel(results[r].path);
        createChildren(finalResults, results[r], level);
      }

      next(err, finalResults);
      return finalResults;
    });
  };


  schema.methods.getChildrenTree = function (args, next) {
    this.constructor.getChildrenTree(this, args, next);
  };

  schema.methods.hasChild = function (cb) {
    const fn = (next) => {
      this.getChildren((err, children) => {
        if (err) {
          return next(err);
        }
        const result = children.length > 0;
        return next(null, result);
      });
    };

    if (cb instanceof Function) {
      return fn(cb);
    }

    const promise = new Promise((resolve, reject) => {
      fn((err, result) => {
        if (err) {
          reject(err);
        }
        resolve(result);
      });
    });

    promise.exec = fn;
    return promise;
  };

  schema.methods.isParentOf = function (child) {
    let isParent = false;

    if (!child.path) {
      throw new Error('child data is not a valid data, require path property!');
    } else {
      const selfPath = this.path;
      if (child.path.indexOf(selfPath + pathSeparator) === 0) {
        isParent = true;
      }
      return isParent;
    }
  };

  schema.methods.isChildOf = function (parent) {
    let isChild = false;

    if (!parent.path) {
      throw new Error('child data is not a valid, require path property!');
    } else {
      const selfPath = this.path;
      if (selfPath.indexOf(parent.path) === 0 && parent.path !== selfPath) {
        isChild = true;
      }
      return isChild;
    }
  };

  schema.methods.addChild = function (query, doc, options, next) {
    if (!query || typeof query !== 'object') { throw new Error("must provide valid the 'query' arguments"); }

    query.parent = this._id;
    const self = this;

    const fn = (cb) => {
      this.constructor.findOrCreate(query, doc, options, (err, result) => {
        if (err) { return cb(err); }
        const child = result.doc;
        if (self.path) {
          child.path = self.path + pathSeparator + child.id;
        } else {
          child.path = self.id + pathSeparator + child.id;
        }
        return child.save((err, doc) => {
          if (err) { return cb(err); }
          cb(null, doc);
          return doc;
        });
      });
    };

    if (next) { return fn(next); }

    const promise = new Promise((resolve, reject) => {
      fn((err, result) => {
        if (err) { return reject(err); }
        return resolve(result);
      });
    });

    promise.exec = fn;
    return promise;
  };

  /**
   * @param listOfData: array of child data, format 1: [{name:child1},{name: child2},...]
   * @param listOfData: array of child data, format 2: [[{query for child1},{doc for child1}],[{query},{doc}],...]
   * @param mode: string nested | normal (default)
   * @return Promise array for created children
   */
  schema.methods.addChildren = function (listOfData, options, mode, next) {
    return this.constructor.addChildren(listOfData, this, options, mode, next);
  };

  schema.statics.addChildren = function (listOfData, parent, options, mode, next) {
    if (typeof (parent) === 'function') {
      next = options;
      parent = undefined;
    }

    if (typeof (options) === 'function') {
      next = options;
      options = undefined;
    }

    if (typeof (mode) === 'function') {
      next = mode;
      mode = 'normal';
    }

    if (typeof (parent) === 'string') {
      mode = parent;
      parent = undefined;
    }

    if (typeof (options) === 'string') {
      mode = options;
      options = undefined;
    }

    if (!mode) {
      mode = 'normal';
    }

    // if (!next || typeof next !== 'function') {
      // return next(new Error('must provide callback function!'));
    // }

    if (!Array.isArray(listOfData)) {
      return next(new Error('child data must be array'));
    }

    if (['nest', 'nested'].indexOf(mode.trim().toLowerCase()) !== -1) {
      mode = 'nested';
    }

    let oParent = parent;
    const self = this;

    const children = [];

    return Promise.each(listOfData, (data) => {
      let oQuery,
        oDoc,
        oOptions;

      if (Array.isArray(data)) {
        if (data[0]) {
          oQuery = data[0];
        }
        if (data[1]) {
          oDoc = data[1];
        }
        if (data[2]) {
          if (typeof data[2] === 'object') {
            if (options) {
              oOptions = Object.assign({}, options, data[2]);
            } else {
              oOptions = data[2];
            }
          }
        }
      } else if (typeof data === 'object') {
        oQuery = data;
      }

      if (oParent && oParent._id) {
        oQuery.parent = oParent._id;
      }

      return self.findOrCreate(oQuery, oDoc, oOptions).then((result) => {
        const oChild = result.doc;

        if (oParent) {
          if (oParent.path) {
            oChild.path = oParent.path + pathSeparator + oChild.id;
          } else if (oParent._id) {
            oChild.path = oParent.id + pathSeparator + oChild.id;
          }
        } else {
          oChild.path = oChild.id;
        }

        return new Promise((resolve, reject) => {
          oChild.save((err, doc) => {
            if (err) { return reject(err); }
            if (mode === 'nested') {
              oParent = doc;
            }
            children.push(doc);
            return resolve(doc);
          });
        });
        // }
        // return Promise.resolve(result);
      });
    })
    .then(() => {
      if (next instanceof Function) {
        return next(null, children);
      }
      return Promise.resolve(children);
    }).catch((err) => {
      children.push({ _id: 1, name: 'test1' });
      if (next instanceof Function) {
        return next(err, children);
      }
      return Promise.reject(err);
    });
  };

    /**
     * @property {Number} level <virtual>
     */
  schema.virtual('level').get(function virtualPropLevel() {
    return this.path ? this.path.split(pathSeparator).length : 0;
  });

  schema.methods.getRoot = function (next) {
    const fn = (cb) => {
      if (!this.parent) {
        return cb(null, this);
      }
      if (this.path) {
        const paths = this.path.split(pathSeparator);
        const rootID = paths[0];
        return this.collection.findOne({ _id: rootID }, cb);
      }
      return cb(new Error('fail to find root!'));
    };

    if (next) { return fn(next); }

    const promise = new Promise((resolve, reject) => {
      fn((err, result) => {
        if (err) { return reject(err); }
        return resolve(result);
      });
    });

    promise.exec = fn;
    return promise;
  };
}
