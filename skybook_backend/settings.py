import os
from pathlib import Path
from dotenv import load_dotenv

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env", override=False)


SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "django-insecure-dev-key")
DEBUG = os.getenv("DJANGO_DEBUG", "true").lower() == "true"
ALLOWED_HOSTS = [host.strip() for host in os.getenv("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1,testserver").split(",") if host.strip()]


# Application definition

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',  
    'api',
    'corsheaders',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'skybook_backend.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'skybook_backend.wsgi.application'


# Database
# https://docs.djangoproject.com/en/6.0/ref/settings/#databases

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.getenv('DB_NAME', 'skybook_db'),
        'USER': os.getenv('DB_USER', 'postgres'),
        'PASSWORD': os.getenv('DB_PASSWORD', ''),
        'HOST': os.getenv('DB_HOST', 'localhost'),
        'PORT': os.getenv('DB_PORT', '5432'),
    }
}


# Password validation
# https://docs.djangoproject.com/en/6.0/ref/settings/#auth-password-validators

AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]


# Internationalization
# https://docs.djangoproject.com/en/6.0/topics/i18n/

LANGUAGE_CODE = 'en-us'

TIME_ZONE = 'UTC'

USE_I18N = True

USE_TZ = True


# Static files (CSS, JavaScript, Images)
# https://docs.djangoproject.com/en/6.0/howto/static-files/

STATIC_URL = 'static/'
CORS_ALLOW_ALL_ORIGINS = os.getenv("CORS_ALLOW_ALL_ORIGINS", "true").lower() == "true"

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
AI_VECTOR_DB_PATH = os.getenv("AI_VECTOR_DB_PATH", str(BASE_DIR / "vector_db_large"))
AI_KNOWLEDGE_BASE_PATH = os.getenv("AI_KNOWLEDGE_BASE_PATH", str(BASE_DIR / "knowledge-base"))

FLIGHT_PROVIDER = os.getenv("FLIGHT_PROVIDER", "local_db")
HOTEL_PROVIDER = os.getenv("HOTEL_PROVIDER", "local_db")
CAR_PROVIDER = os.getenv("CAR_PROVIDER", "local_db")

FLIGHT_PROVIDER_API_KEY = os.getenv("FLIGHT_PROVIDER_API_KEY", "")
HOTEL_PROVIDER_API_KEY = os.getenv("HOTEL_PROVIDER_API_KEY", "")
CAR_PROVIDER_API_KEY = os.getenv("CAR_PROVIDER_API_KEY", "")

FLIGHT_PROVIDER_BASE_URL = os.getenv("FLIGHT_PROVIDER_BASE_URL", "")
HOTEL_PROVIDER_BASE_URL = os.getenv("HOTEL_PROVIDER_BASE_URL", "")
CAR_PROVIDER_BASE_URL = os.getenv("CAR_PROVIDER_BASE_URL", "")

PROVIDER_REQUEST_TIMEOUT_SECONDS = float(os.getenv("PROVIDER_REQUEST_TIMEOUT_SECONDS", "15"))
ENABLE_MOCK_PROVIDERS = os.getenv("ENABLE_MOCK_PROVIDERS", "true").lower() == "true"
