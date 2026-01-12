// Test Vision API endpoint
const testVisionAPI = async () => {
  // Simple test image (1x1 pixel PNG with text "TEST")
  const testImageBase64 = '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8VAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=';
  
  try {
    console.log('Testing Vision API endpoint...');
    const response = await fetch('/api/vision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: testImageBase64 }),
    });
    
    console.log('Response status:', response.status);
    const data = await response.json();
    console.log('Response data:', data);
    
    if (response.ok) {
      console.log('✅ Vision API is working!');
      console.log('Extracted text:', data.text);
    } else {
      console.error('❌ Vision API error:', data);
    }
  } catch (error) {
    console.error('❌ Vision API test failed:', error);
  }
};

testVisionAPI();
