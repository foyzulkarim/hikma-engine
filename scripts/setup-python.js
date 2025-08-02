#!/usr/bin/env node

/**
 * Setup script for Python dependencies in hikma-engine
 * This script helps users install Python dependencies after npm installation
 */

const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const chalk = require('chalk');

const REQUIRED_PACKAGES = ['transformers', 'torch', 'accelerate'];

class PythonSetup {
  constructor() {
    this.verbose = process.argv.includes('--verbose') || process.argv.includes('-v');
  }

  log(message, type = 'info') {
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    switch (type) {
      case 'error':
        console.error(chalk.red(`[${timestamp}] ❌ ${message}`));
        break;
      case 'warn':
        console.warn(chalk.yellow(`[${timestamp}] ⚠️  ${message}`));
        break;
      case 'success':
        console.log(chalk.green(`[${timestamp}] ✅ ${message}`));
        break;
      case 'info':
      default:
        console.log(chalk.blue(`[${timestamp}] ℹ️  ${message}`));
        break;
    }
  }

  async runCommand(command, options = {}) {
    return new Promise((resolve, reject) => {
      if (this.verbose) {
        this.log(`Running: ${command}`);
      }
      
      exec(command, { timeout: options.timeout || 30000, ...options }, (error, stdout, stderr) => {
        if (error) {
          if (this.verbose) {
            this.log(`Command failed: ${error.message}`, 'error');
            if (stderr) this.log(`stderr: ${stderr}`, 'error');
          }
          resolve({ success: false, stdout: stdout || '', stderr: stderr || error.message });
        } else {
          if (this.verbose && stdout) {
            this.log(`stdout: ${stdout}`);
          }
          resolve({ success: true, stdout: stdout || '', stderr: stderr || '' });
        }
      });
    });
  }

  async checkPython() {
    this.log('Checking Python installation...');
    
    // Try python3 first
    let result = await this.runCommand('python3 --version');
    if (result.success) {
      this.log(`Found Python: ${result.stdout.trim()}`, 'success');
      return 'python3';
    }
    
    // Try python as fallback
    result = await this.runCommand('python --version');
    if (result.success && result.stdout.includes('Python 3')) {
      this.log(`Found Python: ${result.stdout.trim()}`, 'success');
      return 'python';
    }
    
    throw new Error('Python 3 is not installed or not found in PATH');
  }

  async checkPip(pythonCmd) {
    this.log('Checking pip installation...');
    
    const result = await this.runCommand(`${pythonCmd} -m pip --version`);
    if (result.success) {
      this.log(`Found pip: ${result.stdout.trim()}`, 'success');
      return true;
    }
    
    throw new Error('pip is not available');
  }

  async checkPackages(pythonCmd) {
    this.log('Checking required packages...');
    
    const missingPackages = [];
    
    for (const pkg of REQUIRED_PACKAGES) {
      const result = await this.runCommand(`${pythonCmd} -c "import ${pkg}; print('${pkg} OK')"`);;
      if (!result.success) {
        missingPackages.push(pkg);
        this.log(`Missing package: ${pkg}`, 'warn');
      } else {
        this.log(`Found package: ${pkg}`, 'success');
      }
    }
    
    return missingPackages;
  }

  findRequirementsFile() {
    const possiblePaths = [
      path.join(__dirname, '..', 'src', 'python', 'requirements.txt'),
      path.join(process.cwd(), 'src', 'python', 'requirements.txt'),
      path.join(process.cwd(), 'node_modules', 'hikma-engine', 'src', 'python', 'requirements.txt')
    ];
    
    for (const reqPath of possiblePaths) {
      if (fs.existsSync(reqPath)) {
        this.log(`Found requirements.txt: ${reqPath}`);
        return reqPath;
      }
    }
    
    this.log('requirements.txt not found, will install packages individually', 'warn');
    return null;
  }

  async installPackages(pythonCmd, missingPackages) {
    this.log('Installing Python packages...');
    
    const requirementsPath = this.findRequirementsFile();
    
    if (requirementsPath) {
      this.log(`Installing from requirements.txt...`);
      const result = await this.runCommand(
        `${pythonCmd} -m pip install -r "${requirementsPath}"`,
        { timeout: 300000 } // 5 minutes
      );
      
      if (result.success) {
        this.log('Successfully installed packages from requirements.txt', 'success');
        return true;
      } else {
        this.log(`Failed to install from requirements.txt: ${result.stderr}`, 'error');
        this.log('Falling back to individual package installation...', 'warn');
      }
    }
    
    // Install packages individually
    for (const pkg of missingPackages) {
      this.log(`Installing ${pkg}...`);
      const result = await this.runCommand(
        `${pythonCmd} -m pip install ${pkg}`,
        { timeout: 300000 }
      );
      
      if (result.success) {
        this.log(`Successfully installed ${pkg}`, 'success');
      } else {
        throw new Error(`Failed to install ${pkg}: ${result.stderr}`);
      }
    }
    
    return true;
  }

  displayInstructions() {
    console.log(chalk.blue('\n🐍 Python Setup Instructions for hikma-engine'));
    console.log(chalk.gray('=' .repeat(50)));
    console.log(chalk.white('\n1. Install Python 3.8 or later:'));
    console.log(chalk.gray('   - macOS: brew install python3'));
    console.log(chalk.gray('   - Ubuntu: sudo apt install python3 python3-pip'));
    console.log(chalk.gray('   - Windows: Download from python.org'));
    
    console.log(chalk.white('\n2. Install required packages:'));
    console.log(chalk.cyan('   pip3 install transformers torch accelerate'));
    
    console.log(chalk.white('\n3. Verify installation:'));
    console.log(chalk.cyan('   python3 -c "import transformers, torch; print(\'Dependencies OK\')"'));
    
    console.log(chalk.white('\n4. Configure hikma-engine to use Python:'));
    console.log(chalk.cyan('   export HIKMA_EMBEDDING_PROVIDER=python'));
    
    console.log(chalk.gray('\nFor more information, visit: https://github.com/foyzulkarim/hikma-engine#python-provider-setup'));
  }

  async setup() {
    try {
      console.log(chalk.blue('\n🚀 Setting up Python dependencies for hikma-engine\n'));
      
      // Check Python
      const pythonCmd = await this.checkPython();
      
      // Check pip
      await this.checkPip(pythonCmd);
      
      // Check packages
      const missingPackages = await this.checkPackages(pythonCmd);
      
      if (missingPackages.length === 0) {
        this.log('All required packages are already installed!', 'success');
        console.log(chalk.green('\n✅ Python environment is ready for hikma-engine!'));
        return;
      }
      
      this.log(`Found ${missingPackages.length} missing packages: ${missingPackages.join(', ')}`, 'warn');
      
      // Install missing packages
      await this.installPackages(pythonCmd, missingPackages);
      
      // Verify installation
      this.log('Verifying installation...');
      const stillMissing = await this.checkPackages(pythonCmd);
      
      if (stillMissing.length === 0) {
        console.log(chalk.green('\n🎉 Python dependencies successfully installed!'));
        console.log(chalk.blue('\n💡 You can now use Python-based features in hikma-engine:'));
        console.log(chalk.cyan('   - Semantic search with embeddings'));
        console.log(chalk.cyan('   - RAG-based code explanations'));
        console.log(chalk.gray('\n   Example: hikma search semantic "authentication logic" --rag'));
      } else {
        this.log(`Some packages are still missing: ${stillMissing.join(', ')}`, 'error');
        throw new Error('Installation verification failed');
      }
      
    } catch (error) {
      this.log(`Setup failed: ${error.message}`, 'error');
      console.log(chalk.yellow('\n📖 Manual setup instructions:'));
      this.displayInstructions();
      process.exit(1);
    }
  }
}

// Handle command line arguments
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(chalk.blue('\nPython Setup Script for hikma-engine\n'));
  console.log('Usage: node setup-python.js [options]\n');
  console.log('Options:');
  console.log('  --help, -h     Show this help message');
  console.log('  --verbose, -v  Show detailed output');
  console.log('  --instructions Show manual setup instructions only');
  console.log('\nThis script will:');
  console.log('  1. Check if Python 3 is installed');
  console.log('  2. Check if pip is available');
  console.log('  3. Install required packages: transformers, torch, accelerate');
  console.log('  4. Verify the installation');
  process.exit(0);
}

if (process.argv.includes('--instructions')) {
  const setup = new PythonSetup();
  setup.displayInstructions();
  process.exit(0);
}

// Run setup
if (require.main === module) {
  const setup = new PythonSetup();
  setup.setup();
}

module.exports = PythonSetup;