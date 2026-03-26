from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
import json

@csrf_exempt
def generate_response(request):
    if request.method == 'POST':
        data = json.loads(request.body)
        user_input = data.get('input', '')
        # Placeholder for AI logic
        ai_response = f"AI response to: {user_input}"
        return JsonResponse({'response': ai_response})
    return JsonResponse({'error': 'Invalid request method'}, status=400)