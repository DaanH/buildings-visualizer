/**
 * Test script for SQLite implementation
 * This script tests the SQLite implementation against the Redis implementation
 */
import { storeImage, getImage, getImageField, deleteImage } from './sqlite.server';

async function testSQLiteImplementation() {
	console.log('Testing SQLite implementation...');
	
	// Test image data
	const imageId = 'test-image-' + Date.now();
	const imageData = 'test-image-data';
	const metadata = {
		status: 'testing',
		fileName: 'test.png',
		timestamp: new Date().toISOString(),
		customField: 'custom value',
		jsonField: { test: true, nested: { value: 42 } }
	};
	
	try {
		// Test storeImage
		console.log('Testing storeImage...');
		await storeImage(imageId, imageData, metadata);
		console.log('✅ storeImage successful');
		
		// Test getImage
		console.log('Testing getImage...');
		const retrievedImage = await getImage(imageId);
		console.log('Retrieved image:', retrievedImage);
		
		if (retrievedImage?.data === imageData && 
			retrievedImage?.status === metadata.status &&
			retrievedImage?.fileName === metadata.fileName &&
			retrievedImage?.timestamp === metadata.timestamp &&
			retrievedImage?.customField === metadata.customField &&
			JSON.stringify(retrievedImage?.jsonField) === JSON.stringify(metadata.jsonField)) {
			console.log('✅ getImage successful - all fields match');
		} else {
			console.log('❌ getImage failed - fields do not match');
			console.log('Expected:', { ...metadata, data: imageData });
			console.log('Actual:', retrievedImage);
		}
		
		// Test getImageField
		console.log('Testing getImageField...');
		const status = await getImageField(imageId, 'status');
		console.log('Retrieved status:', status);
		
		if (status === metadata.status) {
			console.log('✅ getImageField successful - status matches');
		} else {
			console.log('❌ getImageField failed - status does not match');
			console.log('Expected:', metadata.status);
			console.log('Actual:', status);
		}
		
		// Test JSON field retrieval
		console.log('Testing getImageField with JSON field...');
		const jsonField = await getImageField(imageId, 'jsonField');
		console.log('Retrieved jsonField:', jsonField);
		
		if (JSON.stringify(jsonField) === JSON.stringify(metadata.jsonField)) {
			console.log('✅ getImageField successful - jsonField matches');
		} else {
			console.log('❌ getImageField failed - jsonField does not match');
			console.log('Expected:', metadata.jsonField);
			console.log('Actual:', jsonField);
		}
		
		// Test deleteImage
		console.log('Testing deleteImage...');
		await deleteImage(imageId);
		console.log('✅ deleteImage called');
		
		// Verify deletion
		const deletedImage = await getImage(imageId);
		if (deletedImage === null) {
			console.log('✅ deleteImage successful - image was deleted');
		} else {
			console.log('❌ deleteImage failed - image still exists');
			console.log('Image data after deletion:', deletedImage);
		}
		
		console.log('All tests completed!');
	} catch (error) {
		console.error('Error during testing:', error);
	}
}

// Run the tests
testSQLiteImplementation();
