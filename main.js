const API_KEY = "<replace_api_key>";
const EXTERNAL_USER_ID = "<replace_external_user_id>";

const BASE_URL = "https://api.on-demand.io/chat/v1"

async function createChatSession(apiKey, externalUserId) {
    const url = `${BASE_URL}/sessions`;
    const headers = {
        "apikey": apiKey,
        "Content-Type": "application/json"
    };
    const body = JSON.stringify({
        agentIds: [], // Or use pluginIds if appropriate for session creation
        externalUserId: externalUserId
    });

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: headers,
            body: body
        });

        const responseData = await response.json();
        if (response.status === 201) {
            const sessionId = responseData.data?.id;
            if (sessionId) {
                console.log(`Chat session created. Session ID: ${sessionId}`);
                return sessionId;
            } else {
                console.error(`Error: 'data.id' not found in response. Full response:`, responseData);
                return null;
            }
        } else {
            console.error(`Error creating chat session: ${response.status} - ${responseData.message || JSON.stringify(responseData)}`);
            return null;
        }
    } catch (error) {
        console.error(`Request failed during session creation:`, error);
        return null;
    }
}

async function submitQuery(apiKey, sessionId, queryText, responseMode = "sync") {
    const url = `${BASE_URL}/sessions/${sessionId}/query`;
    const headers = {
        "apikey": apiKey,
        "Content-Type": "application/json"
    };

    const modelConfigs = {
        fulfillmentPrompt: ``,
        stopSequences: [],
        temperature: 0.7,
        topP: 1,
        maxTokens: 0,
        presencePenalty: 0,
        frequencyPenalty: 0
    };
    
    const body = JSON.stringify({
        endpointId: "predefined-openai-gpt4.1",
        query: queryText,
        agentIds: ["agent-1712327325","agent-1713962163","agent-1716455998","agent-1716434059","agent-1716429542","agent-1741770626","agent-1713954536","agent-1713958591","agent-1713958830","agent-1713961903","agent-1713967141"],
        responseMode: responseMode,
        reasoningMode: "medium",
        modelConfigs: modelConfigs
    });

    try {
        if (responseMode === "sync") {
            const response = await fetch(url, {
                method: "POST",
                headers: headers,
                body: body
            });
            const responseData = await response.json();
            if (response.ok) {
                console.log("Sync query submitted successfully.");
                return responseData;
            } else {
                console.error(`Error submitting sync query: ${response.status} - ${responseData.message || JSON.stringify(responseData)}`);
                return null;
            }
        } else if (responseMode === "stream") {
            console.log(`Submitting query in stream mode for session ${sessionId}...`);
            const response = await fetch(url, {
                method: "POST",
                headers: headers,
                body: body
            });

            if (!response.ok) {
                const errorData = await response.text();
                console.error(`Error submitting stream query: ${response.status} - ${errorData}`);
                return null;
            }

            if (!response.body) {
                console.error("ReadableStream not available.");
                return "Stream failed: No readable stream.";
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let buffer = '';

            console.log("Streaming response:");
            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    break;
                }
                buffer += decoder.decode(value, { stream: true });
                
                let eventEndIndex;
                while ((eventEndIndex = buffer.indexOf('\n\n')) !== -1) {
                    const eventStr = buffer.substring(0, eventEndIndex);
                    buffer = buffer.substring(eventEndIndex + 2); // +2 for '\n\n'
                    
                    if (eventStr.startsWith("data:")) {
                        const dataJsonStr = eventStr.substring(5).trim(); // Skip "data:"
                        if (dataJsonStr) {
                            if (dataJsonStr === "[DONE]") {
                                console.log("SSE Stream End: [DONE]");
                                reader.cancel(); // Important to release the lock on the stream
                                return "Stream finished";
                            }
                            try {
                                const dataEvent = JSON.parse(dataJsonStr);
                                console.log("SSE Data:", dataEvent);
                            } catch (e) {
                                console.log("SSE Non-JSON Data:", dataJsonStr);
                            }
                        }
                    }
                }
            }
            if (buffer.trim().startsWith("data:") && buffer.trim().endsWith("[DONE]")) { // Handle case where [DONE] is the last part
                 console.log("SSE Stream End: [DONE]");
            } else if (buffer.trim()) {
                console.log("SSE Remaining Buffer Data:", buffer.trim()); // Log any remaining data
            }

            return "Stream finished";
        } else {
            console.error(`Unsupported responseMode: ${responseMode}`);
            return null;
        }
    } catch (error) {
        console.error(`Request failed during query submission:`, error);
        return null;
    }
}

(async () => {
    if (API_KEY === "<replace_api_key>" || EXTERNAL_USER_ID === "<replace_external_user_id>") {
        console.warn("Please replace '<replace_api_key>' and '<replace_external_user_id>' at the top of the script with your actual values.");
    } else {
        const sessionId = await createChatSession(API_KEY, EXTERNAL_USER_ID);

        if (sessionId) {
            console.log("\n--- Testing Sync Mode ---");
            const syncQueryText = "What is the capital of France in sync mode?";
            const syncResponseData = await submitQuery(API_KEY, sessionId, syncQueryText, "sync");
            if (syncResponseData) {
                console.log("Sync Response Data:");
                console.log(JSON.stringify(syncResponseData, null, 2));
            }

            console.log("\n--- Testing Stream Mode ---");
            const streamQueryText = "Tell me a very short story in stream mode, one sentence at a time.";
            const streamResultStatus = await submitQuery(API_KEY, sessionId, streamQueryText, "stream");
            if (streamResultStatus) {
                console.log(`\nStream processing status: ${streamResultStatus}`);
            }
        } else {
            console.error("Failed to create chat session. Cannot proceed with submitting queries.");
        }
    }
})();