#!/usr/bin/env node

import FirecrawlApp from '@mendable/firecrawl-js';

async function diagnoseFirecrawl() {
  console.log('🔍 Diagnosing Firecrawl Configuration...\n');
  
  // Check environment variables
  console.log('📋 Environment Variables:');
  console.log(`FIRECRAWL_API_URL: ${process.env.FIRECRAWL_API_URL || 'Not set'}`);
  console.log(`FIRECRAWL_API_KEY: ${process.env.FIRECRAWL_API_KEY ? 'Set' : 'Not set'}`);
  console.log(`FIRECRAWL_API_KEY length: ${process.env.FIRECRAWL_API_KEY?.length || 0}\n`);
  
  // Test Firecrawl client initialization
  console.log('🔧 Testing Firecrawl Client Initialization...');
  try {
    const client = new FirecrawlApp({
      apiKey: process.env.FIRECRAWL_API_KEY || '123',
      apiUrl: process.env.FIRECRAWL_API_URL || 'http://10.10.1.81:3002'
    });
    
    console.log('✅ Firecrawl client initialized successfully');
    
    // Test a simple scrape operation
    console.log('\n🧪 Testing scrape operation...');
    try {
      const result = await client.scrapeUrl({
        url: 'https://httpbin.org/html',
        formats: ['markdown']
      });
      
      console.log('✅ Scrape operation successful');
      console.log('📄 Result type:', typeof result);
      console.log('📄 Result length:', Array.isArray(result) ? result.length : 'N/A');
      
    } catch (scrapeError) {
      console.log('❌ Scrape operation failed:');
      console.log('Error message:', scrapeError.message);
      console.log('Error code:', scrapeError.code);
      console.log('Error status:', scrapeError.status);
      
      if (scrapeError.message.includes('401')) {
        console.log('\n🔑 Authentication Issue Detected:');
        console.log('- Check if FIRECRAWL_API_KEY is correct');
        console.log('- Verify the API key has proper permissions');
        console.log('- Ensure the API key is not expired');
      }
      
      if (scrapeError.message.includes('404')) {
        console.log('\n🌐 Endpoint Issue Detected:');
        console.log('- Check if FIRECRAWL_API_URL is correct');
        console.log('- Verify the Firecrawl service is running');
        console.log('- Ensure the API endpoint exists');
      }
      
      if (scrapeError.message.includes('network')) {
        console.log('\n🌐 Network Issue Detected:');
        console.log('- Check network connectivity');
        console.log('- Verify firewall settings');
        console.log('- Ensure the service is accessible');
      }
    }
    
  } catch (initError) {
    console.log('❌ Firecrawl client initialization failed:');
    console.log('Error:', initError.message);
  }
  
  console.log('\n🏁 Diagnosis completed!');
}

// Run diagnosis
diagnoseFirecrawl().catch(console.error);
