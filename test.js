const fs = require('fs');
const path = require('path');
const { convert } = require('pdf-poppler');

// HARDCODED PATHS - Change these to your actual paths
const PDF_PATH = 'C:\\Users\\umair\\Downloads\\Sample Claim 1.1.pdf';
const OUTPUT_DIR = './extracted_images';

async function extractImagesFromPDF() {
  try {
    // Create output directory if it doesn't exist
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    // Check if PDF exists
    if (!fs.existsSync(PDF_PATH)) {
      console.error(`❌ PDF file not found: ${PDF_PATH}`);
      process.exit(1);
    }

    console.log(`📄 Processing PDF: ${PDF_PATH}`);
    console.log(`📁 Output directory: ${OUTPUT_DIR}\n`);

    // Options for conversion
    const options = {
      format: 'png',
      out_dir: OUTPUT_DIR,
      out_prefix: 'page',
      page: null, // Convert all pages
      scale: 2048, // Higher resolution (adjust between 1024-4096 for quality)
    };

    console.log('⏳ Converting PDF pages to high-quality images...\n');

    // Convert PDF pages to images
    const result = await convert(PDF_PATH, options);

    // Count the generated images
    const files = fs.readdirSync(OUTPUT_DIR).filter(f => f.startsWith('page') && f.endsWith('.png'));
    
    console.log(`\n🎉 Total images extracted: ${files.length}`);
    console.log(`📂 Images saved to: ${path.resolve(OUTPUT_DIR)}`);
    
    files.forEach((file, index) => {
      console.log(`✓ ${file}`);
    });

    return files.length;
  } catch (error) {
    console.error('❌ Error processing PDF:', error.message);
    console.error('\n📌 Make sure you have poppler installed:');
    console.error('   Windows: Download from https://github.com/oschwartz10612/poppler-windows/releases/');
    console.error('            Extract and add the bin folder to your PATH');
    console.error('   Mac: brew install poppler');
    console.error('   Linux: sudo apt-get install poppler-utils');
    throw error;
  }
}

// Run the extraction
extractImagesFromPDF()
  .then(count => {
    if (count === 0) {
      console.log('\n⚠️  No images were created.');
    }
  })
  .catch(err => {
    console.error('Failed to extract images:', err);
    process.exit(1);
  });