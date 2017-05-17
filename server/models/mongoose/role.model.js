
import mongoose from 'mongoose';
import tree from './plugins/tree';

const schema = new mongoose.Schema({
  name: { type: String },
  node: { type: String },
  space: { type: mongoose.Schema.Types.ObjectId, ref: 'Space' },
});

schema.plugin(tree);

export default mongoose.model('Role', schema);
