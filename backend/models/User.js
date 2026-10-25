const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  email: { type: String, required: true, unique: true, trim: true, lowercase: true },
  password: { type: String, required: true, minlength: 8 },
  // Global role (default is User. Admin/Manager are assigned per group later)
  // End-to-end encryption: public key + password-encrypted private key backup (server cannot read it)
  bio: { type: String, default: '', maxlength: 160 },
  avatar: { type: String, default: '' },   // file name of the uploaded profile picture (empty = generated avatar)
  friendCode: { type: String, unique: true, sparse: true },
  publicKey: { type: String, default: '' },
  keyBackup: { salt: String, nonce: String, cipher: String },
  globalRole: { type: String, enum: ['User', 'SuperAdmin'], default: 'User' } 
}, { timestamps: true });

// FIX: Removed 'next' parameter. Modern Mongoose handles async hooks automatically.
userSchema.pre('save', async function() {
  // Only hash the password if it has been modified (or is new)
  if (!this.isModified('password')) return;
  
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Method to compare passwords during login
userSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);