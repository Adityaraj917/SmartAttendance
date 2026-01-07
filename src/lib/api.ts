const API_URL = 'http://localhost:3000';

export async function apiRequest(endpoint: string, method: string = 'GET', body?: any) {
    const headers = {
        'Content-Type': 'application/json',
    };

    const config: RequestInit = {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
    };

    try {
        const response = await fetch(`${API_URL}${endpoint}`, config);
        // Handle 401/403 if needed (but we are keeping it simple for prototype)
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.message || 'API Error');
        }
        return await response.json();
    } catch (error) {
        console.error('API Request failed:', error);
        throw error;
    }
}
