plugins {
    id("com.android.application")
}

android {
    namespace = "com.grayxon.caixuntv"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.grayxon.caixuntv"
        minSdk = 23
        targetSdk = 34
        versionCode = 1
        versionName = "0.1.0"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
