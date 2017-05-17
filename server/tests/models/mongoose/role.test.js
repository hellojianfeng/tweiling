

import mongoose from 'mongoose';
import assert from 'power-assert';
import role from '../../../models/mongoose/role.model';

let oParent,
  oChild1,
  oChild11;

describe('test model/role.js', () => {
  const newRoleData = {
    name: 'parent1',
    node: 'node1',
  };

  const tempoaryRecords = [];

  it('assert variable', () => {
    assert(role);
  });

  it('create new role', () => {
    role.create(newRoleData).then((created) => {
      assert(created, 'created cannot be empty.');
      assert(created._id instanceof mongoose.Types.ObjectId, 'created id cannot be empty.');
      newRoleData._id = created._id;
      oParent = created;
      tempoaryRecords.push(newRoleData._id);
    });
  });

/*
  it('create/save/getChildren/getLeaves', function* () {
    const data1 = { name: 'child1' };
    oChild1 = yield role.create(data1);
    oChild1.parent = oParent;
    const saved1 = yield oChild1.save();
    const data2 = { name: 'child2' };
    const oChild2 = yield role.create(data2);
    oChild2.parent = oParent;
    const saved2 = yield oChild2.save();
    const data11 = { name: 'child11' };
    oChild11 = yield role.create(data11);
    oChild11.parent = oChild1;
    const saved11 = yield oChild11.save();
    const data12 = { name: 'child12' };
    const oChild12 = yield role.create(data12);
    oChild12.parent = oChild1;
    const saved12 = yield oChild12.save();
    const data21 = { name: 'child21' };
    const oChild21 = yield role.create(data21);
    oChild21.parent = oChild2;
    const saved21 = yield oChild21.save();
    assert(saved11, 'saved cannot be empty.');
    assert(oChild11._id instanceof mongoose.Types.ObjectId, 'child id cannot be empty.');
    assert(oChild11.parent === oChild1._id, ' child parent should add.');
    const children = yield oParent.getChildren();
    assert(children.length === 2, 'should have 2 no-recursive children.');
    // const getRecursive = yield oParent.getChildren(true, function(err, children) {
      // assert(children.length === 5, 'should have 5 recursive children.');
    // });
    const getRecursive = yield oParent.getChildren(true);
    assert(getRecursive.length === 5, 'should have 5 recursive children.');

    const leaves = yield oParent.getLeaves();
    assert(leaves.length === 3, 'should have 3 leaves.');
    assert(leaves[0].name === 'child11', 'leaves[0] node should be node1.child1.child11.');

    tempoaryRecords.push(oChild1._id);
    tempoaryRecords.push(oChild2._id);
    tempoaryRecords.push(oChild11._id);
    tempoaryRecords.push(oChild12._id);
    tempoaryRecords.push(oChild21._id);
  });

  it('hasChild/isParent/isChild', function* () {
    let isHasChild = yield oChild1.hasChild();
    assert(isHasChild === true, 'hasChild === true.');
    isHasChild = yield oChild11.hasChild();
    assert(isHasChild === false, 'hasChild === false.');

    let isParent = oChild1.isParentOf(oChild11);
    assert(isParent === true, 'isParent === true.');
    isParent = oChild11.isParentOf(oChild1);
    assert(isParent === false, 'isParent === false.');

    let isChild = oChild11.isChildOf(oChild1);
    assert(isChild === true, 'isChild === true.');
    isChild = oChild1.isChildOf(oChild11);
    assert(isChild === false, 'isChild === false.');
  });

  it('getNestedField', function* () {
    let nestName = yield oChild11.getNestedField('name');
    assert(nestName === 'parent1.child1.child11', 'should be parent1.child1.child11.');

    nestName = yield oChild11.getNestedField('name', '|');
    assert(nestName === 'parent1|child1|child11', 'should be parent1.child1.child11.');
  });

  it('findOrCreate/addChild/addChildren', function* () {
    role.findOrCreate({ name: 'child3' }, (err, result) => {
      assert(result.doc._id instanceof mongoose.Types.ObjectId, 'child._id cannot be empty.');
      assert(result.doc.name === 'child3', 'name should be child4');
      tempoaryRecords.push(result.doc._id);
    });

    const oChild4 = yield oParent.addChild({ name: 'child4' });
    assert(oChild4._id instanceof mongoose.Types.ObjectId, 'child._id cannot be empty.');
    assert(oChild4.name === 'child4', 'name should be child3');
    assert(oChild4.parent.toString() === oParent.id, 'should add parent already');
    tempoaryRecords.push(oChild4._id);

    const child = yield oParent.addChild({ name: 'child4' });
    assert(child._id instanceof mongoose.Types.ObjectId, 'child._id cannot be empty.');
    assert(child.id === oChild4.id, 'should be exist ochild4');
    assert(child.parent.toString() === oParent.id, 'should add parent already');

    const oChild41 = yield oChild4.addChild({ name: 'child41' }, { node: 'node41' });
    assert(oChild41._id instanceof mongoose.Types.ObjectId, 'child._id cannot be empty.');
    assert(oChild41.node === 'node41', 'node should be node41');
    assert(oChild41.parent.toString() === oChild4.id, 'should add parent already');

    let children = yield oChild4.addChildren([{ name: 'child41' }, { name: 'child42' }]);
    assert(children[0]._id instanceof mongoose.Types.ObjectId, 'child._id cannot be empty.');
    assert(children[0].name === 'child41', 'node should be child13');
    assert(children[0].parent.toString() === oChild4.id, 'child4 should be parent of  child41');
    assert(children[1]._id instanceof mongoose.Types.ObjectId, 'child._id cannot be empty.');
    assert(children[1].name === 'child42', 'node should be child42');
    assert(children[1].parent.toString() === oChild4.id, 'child4 should be parent of child42');
    tempoaryRecords.push(children[0]._id);
    tempoaryRecords.push(children[1]._id);

    children = yield oParent.addChildren([{ name: 'child5' }, { name: 'child51' }], 'nested');
    assert(children[0]._id instanceof mongoose.Types.ObjectId, 'child._id cannot be empty.');
    assert(children[0].name === 'child5', 'node should be child5');
    assert(children[0].parent.toString() === oParent.id, 'oParent should be parent of child5');
    assert(children[1]._id instanceof mongoose.Types.ObjectId, 'child._id cannot be empty.');
    assert(children[1].name === 'child51', 'node should be child31');
    assert(children[1].parent.toString() === children[0].id, 'child5 should be parent of child51');
    tempoaryRecords.push(children[0]._id);
    tempoaryRecords.push(children[1]._id);

    children = yield oParent.addChildren([[{ name: 'child6' }, { node: 'node6' }], [{ name: 'child61' }, { node: 'node61' }]]);
    assert(children[0]._id instanceof mongoose.Types.ObjectId, 'child._id cannot be empty.');
    assert(children[0].name === 'child6', 'name should be child6');
    assert(children[0].node === 'node6', 'node should be node6');
    assert(children[0].parent.toString() === oParent.id, 'oParent should be parent of child6');
    assert(children[1]._id instanceof mongoose.Types.ObjectId, 'child._id cannot be empty.');
    assert(children[1].name === 'child61', 'node should be child61');
    assert(children[1].node === 'node61', 'node should be child61');
    assert(children[1].parent.toString() === oParent.id, 'child6 should be parent of child61');
    tempoaryRecords.push(children[0]._id);
    tempoaryRecords.push(children[1]._id);
  });*/

  /*
  it('getRoot in role', function* () {
    const spaceData = {
      uid: 'billyn.com',
      name: 'Billyn',
    };

    const roleData = {
      node: 'admin',
      name: 'admin',
    };

    const created = yield app.model.space.findOrCreate(spaceData);
    roleData.space = created.doc._id;
    const createdRole = yield role.findOrCreate(roleData);
    roleData.space = spaceData;
    const root = yield createdRole.doc.getRoot();

    assert(root, 'added cannot be empty.');
    assert(root._id instanceof mongoose.Types.ObjectId, 'root id cannot be empty.');
    tempoaryRecords.push(created.doc._id);

  });

  it('static addChildren', function* () {
    const spaceData = {
      uid: 'billyn.com',
      name: 'Billyn',
    };

    let normalRoles = [{
      node: 'admin',
      name: 'admin',
    }, { node: 'member', name: 'member' }, { node: 'public', name: 'public' }];

    let nestedRoles = [{ node: 'child1', name: 'child1' }, { node: 'child2', name: 'child2' }, { name: 'child3', node: 'child3' }];

    const created = yield app.model.space.findOrCreate(spaceData);
    normalRoles = normalRoles.map(function(o) {
      o.space = created.doc._id;
      return o;
    });
    nestedRoles = nestedRoles.map(function(o) {
      o.space = created.doc._id;
      return o;
    });
    const normalChildren = yield role.addChildren(normalRoles);
    const nestedChildren = yield role.addChildren(nestedRoles, 'nested');

    assert(normalChildren, 'normal children cannot be empty.');
    assert(nestedChildren, 'nested children cannot be empty.');

    assert(normalChildren.length === 3, 'normal children length = 3.');
    assert(nestedChildren.length === 3, 'nested children length = 3.');

    assert(normalChildren[0].parent == null, 'normal children 1 have no parent.');
    assert(normalChildren[1].parent == null, 'normal children 2 have no parent.');
    assert(normalChildren[2].parent == null, 'normal children 3 have no parent.');

    assert(nestedChildren[0].parent == null, 'nested children[0] have no parent.');
    assert(nestedChildren[1].parent.toString() === nestedChildren[0].id, 'children[0] should be parent of children[1].');
    assert(nestedChildren[2].parent.toString() === nestedChildren[1].id, 'children[1] should be parent of children[2].');

    tempoaryRecords.push(created.doc._id);

  });*/

  after(() => role.remove({ id: tempoaryRecords }));
});
