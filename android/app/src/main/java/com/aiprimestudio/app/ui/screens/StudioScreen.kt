package com.aiprimestudio.app.ui.screens

import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Environment
import android.util.Base64
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.aiprimestudio.app.data.model.GenerationItem
import com.aiprimestudio.app.data.repository.AppRepository
import com.aiprimestudio.app.ui.theme.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream

fun downloadMediaToDevice(context: Context, mediaUrl: String, filename: String = "AI_Prime_Creation.mp4") {
    try {
        val uri = Uri.parse(mediaUrl)
        val request = DownloadManager.Request(uri).apply {
            setTitle("AI Prime Studio")
            setDescription("Downloading video to gallery...")
            setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, "AI_Prime_${System.currentTimeMillis()}_$filename")
            setAllowedOverMetered(true)
            setAllowedOverRoaming(true)
        }
        val dm = context.getSystemService(Context.DOWNLOAD_SERVICE) as? DownloadManager
        dm?.enqueue(request)
        Toast.makeText(context, "Download started. Saving to Downloads folder...", Toast.LENGTH_SHORT).show()
    } catch (e: Exception) {
        Toast.makeText(context, "Download failed: ${e.message}", Toast.LENGTH_SHORT).show()
    }
}

@Composable
fun StudioScreen(
    repository: AppRepository,
    selectedTemplateId: String?,
    onNavigateToSubscription: () -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val user by repository.currentUser.collectAsState()
    val wallet by repository.currentWallet.collectAsState()

    var prompt by remember { mutableStateOf("Ultra-cinematic viral reel transformation, 4K HDR quality") }
    var selectedImageUri by remember { mutableStateOf<Uri?>(null) }
    var uploadedFileId by remember { mutableStateOf<String?>(null) }

    var isGenerating by remember { mutableStateOf(false) }
    var currentStep by remember { mutableStateOf<String?>(null) }
    var statusMessage by remember { mutableStateOf<String?>(null) }
    var generatedOutputUrl by remember { mutableStateOf<String?>(null) }
    var currentGenerationId by remember { mutableStateOf<String?>(null) }
    var showReportDialog by remember { mutableStateOf(false) }
    var reportReason by remember { mutableStateOf("Inappropriate Content") }

    var myCreations by remember { mutableStateOf<List<GenerationItem>>(emptyList()) }

    // Refresh creations list when user logs in
    LaunchedEffect(user) {
        if (user != null) {
            val res = repository.fetchMyCreations()
            if (res.isSuccess) {
                myCreations = res.getOrNull() ?: emptyList()
            }
        } else {
            myCreations = emptyList()
        }
    }

    val photoPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia()
    ) { uri: Uri? ->
        if (uri != null) {
            selectedImageUri = uri
            uploadedFileId = null
            generatedOutputUrl = null
            statusMessage = "Photo selected. Ready to generate."
        }
    }

    val availableCredits = wallet?.effectiveBalance ?: user?.credits ?: 0

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(ObsidianBackground)
            .statusBarsPadding()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = "AI REELS STUDIO",
            fontSize = 20.sp,
            fontWeight = FontWeight.Black,
            color = AmberGold,
            letterSpacing = 1.sp
        )
        Text(
            text = "Transform Photos into Cinematic Videos",
            fontSize = 12.sp,
            color = TextSecondary
        )

        Spacer(modifier = Modifier.height(20.dp))

        // Photo Upload / Picker Card
        Card(
            shape = RoundedCornerShape(20.dp),
            colors = CardDefaults.cardColors(containerColor = CardSurface),
            modifier = Modifier
                .fillMaxWidth()
                .height(220.dp)
                .border(1.dp, CardBorder, RoundedCornerShape(20.dp))
                .clickable(enabled = !isGenerating) {
                    photoPickerLauncher.launch(
                        PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)
                    )
                }
        ) {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) {
                if (selectedImageUri != null) {
                    AsyncImage(
                        model = selectedImageUri,
                        contentDescription = "Selected Source Photo",
                        contentScale = ContentScale.Crop,
                        modifier = Modifier
                            .fillMaxSize()
                            .clip(RoundedCornerShape(20.dp))
                    )
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .background(Color.Black.copy(alpha = 0.35f)),
                        contentAlignment = Alignment.BottomCenter
                    ) {
                        Text(
                            text = "Tap to Change Photo",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color.White,
                            modifier = Modifier.padding(bottom = 12.dp)
                        )
                    }
                } else {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.AddPhotoAlternate,
                            contentDescription = "Upload Photo",
                            tint = AmberPrimary,
                            modifier = Modifier.size(48.dp)
                        )
                        Text(
                            text = "Tap to Select Face or Photo",
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Bold,
                            color = TextPrimary
                        )
                        Text(
                            text = "JPG, PNG up to 10MB",
                            fontSize = 11.sp,
                            color = TextMuted
                        )
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        // Prompt input
        OutlinedTextField(
            value = prompt,
            onValueChange = { prompt = it },
            enabled = !isGenerating,
            label = { Text("Style & Effect Description", color = TextSecondary) },
            colors = OutlinedTextFieldDefaults.colors(
                focusedTextColor = TextPrimary,
                unfocusedTextColor = TextPrimary,
                focusedBorderColor = AmberPrimary,
                unfocusedBorderColor = CardBorder,
                focusedContainerColor = CardSurface,
                unfocusedContainerColor = CardSurface
            ),
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(16.dp),
            maxLines = 3
        )

        Spacer(modifier = Modifier.height(20.dp))

        // Credits indicator
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.Bolt,
                    contentDescription = null,
                    tint = AmberGold,
                    modifier = Modifier.size(16.dp)
                )
                Text(
                    text = "Cost: 10 Credits",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    color = TextPrimary
                )
            }

            Text(
                text = "Available: $availableCredits Credits",
                fontSize = 12.sp,
                color = AmberGold,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.clickable { onNavigateToSubscription() }
            )
        }

        Spacer(modifier = Modifier.height(16.dp))

        // Generate Action Button
        Button(
            onClick = {
                if (user == null) {
                    statusMessage = "Please sign in from the Profile tab first."
                    return@Button
                }
                if (availableCredits < 10) {
                    onNavigateToSubscription()
                    return@Button
                }
                if (selectedImageUri == null) {
                    statusMessage = "Please select a photo first."
                    return@Button
                }

                scope.launch {
                    try {
                        isGenerating = true
                        currentStep = "Compressing"
                        statusMessage = "Compressing & preparing image..."

                        // 1. Read and encode image to Base64
                        val base64 = withContext(Dispatchers.IO) {
                            val inputStream = context.contentResolver.openInputStream(selectedImageUri!!)
                            val bitmap = BitmapFactory.decodeStream(inputStream)
                            val outputStream = ByteArrayOutputStream()
                            bitmap.compress(Bitmap.CompressFormat.JPEG, 85, outputStream)
                            val bytes = outputStream.toByteArray()
                            Base64.encodeToString(bytes, Base64.NO_WRAP)
                        }

                        // 2. Upload media
                        currentStep = "Uploading"
                        statusMessage = "Uploading image to secure storage..."
                        val uploadResult = repository.uploadMedia("data:image/jpeg;base64,$base64", "customer_photo.jpg")
                        if (uploadResult.isFailure) {
                            isGenerating = false
                            currentStep = null
                            statusMessage = "Upload failed: ${uploadResult.exceptionOrNull()?.message}"
                            return@launch
                        }

                        val uploadData = uploadResult.getOrNull()
                        val mediaUrl = uploadData?.url ?: uploadData?.fileId?.let { "/api/media/$it" } ?: ""
                        uploadedFileId = uploadData?.fileId

                        // 3. Create generation job
                        currentStep = "Queued"
                        statusMessage = "Submitting generation job to GPU..."
                        val targetTemplateId = selectedTemplateId ?: "tpl_full_swag_1"
                        val createResult = repository.createGeneration(
                            templateId = targetTemplateId,
                            inputMediaUrl = mediaUrl,
                            customPrompt = prompt
                        )

                        if (createResult.isFailure) {
                            isGenerating = false
                            currentStep = null
                            statusMessage = "Job creation failed: ${createResult.exceptionOrNull()?.message}"
                            return@launch
                        }

                        val genId = createResult.getOrNull()?.generationId ?: ""
                        currentGenerationId = genId
                        currentStep = "Processing"
                        statusMessage = "Processing generation on cloud GPU..."

                        // 4. Polling loop with real backend status
                        var isFinished = false
                        var pollCount = 0
                        while (!isFinished && pollCount < 40) {
                            delay(2500)
                            pollCount++
                            val statusRes = repository.getGenerationStatus(genId)
                            if (statusRes.isSuccess) {
                                val statusResponse = statusRes.getOrNull()
                                val resultUrl = statusResponse?.effectiveResultUrl
                                val currentStatus = statusResponse?.currentStatus ?: "processing"

                                if (currentStatus == "completed" && resultUrl != null) {
                                    generatedOutputUrl = resultUrl
                                    currentStep = null
                                    statusMessage = "Generation complete!"
                                    isFinished = true
                                    // Refresh creations list
                                    val updatedCreations = repository.fetchMyCreations()
                                    if (updatedCreations.isSuccess) {
                                        myCreations = updatedCreations.getOrNull() ?: emptyList()
                                    }
                                } else if (currentStatus == "failed") {
                                    currentStep = null
                                    statusMessage = "Generation failed: ${statusResponse?.error ?: "Internal error"}"
                                    isFinished = true
                                } else {
                                    currentStep = currentStatus.replaceFirstChar { it.uppercase() }
                                    statusMessage = "Status: $currentStep..."
                                }
                            }
                        }

                        isGenerating = false
                    } catch (e: Exception) {
                        isGenerating = false
                        currentStep = null
                        statusMessage = "Error: ${e.message}"
                    }
                }
            },
            enabled = !isGenerating,
            colors = ButtonDefaults.buttonColors(containerColor = AmberGold),
            shape = RoundedCornerShape(16.dp),
            modifier = Modifier
                .fillMaxWidth()
                .height(52.dp)
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                if (isGenerating) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(20.dp),
                        color = Color.Black,
                        strokeWidth = 2.dp
                    )
                } else {
                    Icon(
                        imageVector = Icons.Default.AutoAwesome,
                        contentDescription = null,
                        tint = Color.Black
                    )
                }
                Text(
                    text = when {
                        isGenerating -> "${currentStep ?: "Processing"}..."
                        availableCredits < 10 -> "Get Credits to Generate"
                        else -> "Generate 4K Video"
                    },
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Black,
                    color = Color.Black
                )
            }
        }

        if (statusMessage != null) {
            Spacer(modifier = Modifier.height(12.dp))
            Text(
                text = statusMessage!!,
                fontSize = 12.sp,
                color = AmberGold
            )
        }

        // Generated Result Showcase
        if (generatedOutputUrl != null) {
            Spacer(modifier = Modifier.height(24.dp))
            Card(
                shape = RoundedCornerShape(20.dp),
                colors = CardDefaults.cardColors(containerColor = CardSurface),
                modifier = Modifier
                    .fillMaxWidth()
                    .border(1.dp, AmberGold.copy(alpha = 0.5f), RoundedCornerShape(20.dp))
            ) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(
                        text = "GENERATION COMPLETE",
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold,
                        color = AmberGold
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    AsyncImage(
                        model = generatedOutputUrl,
                        contentDescription = "Generated Output",
                        contentScale = ContentScale.Crop,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(260.dp)
                            .clip(RoundedCornerShape(16.dp))
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Button(
                            onClick = {
                                downloadMediaToDevice(context, generatedOutputUrl!!)
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = AmberGold),
                            modifier = Modifier.weight(1f)
                        ) {
                            Icon(Icons.Default.Download, contentDescription = null, tint = Color.Black)
                            Spacer(modifier = Modifier.width(4.dp))
                            Text("Save", color = Color.Black, fontWeight = FontWeight.Bold)
                        }

                        Button(
                            onClick = {
                                val shareIntent = Intent(Intent.ACTION_SEND).apply {
                                    type = "text/plain"
                                    putExtra(Intent.EXTRA_TEXT, "Look what I made on AI Prime Studio: $generatedOutputUrl")
                                }
                                context.startActivity(Intent.createChooser(shareIntent, "Share Creation"))
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = AmberGold),
                            modifier = Modifier.weight(1f)
                        ) {
                            Icon(Icons.Default.Share, contentDescription = null, tint = Color.Black)
                            Spacer(modifier = Modifier.width(4.dp))
                            Text("Share", color = Color.Black, fontWeight = FontWeight.Bold)
                        }

                        OutlinedButton(
                            onClick = { showReportDialog = true },
                            colors = ButtonDefaults.outlinedButtonColors(contentColor = TextMuted),
                            modifier = Modifier.weight(1f)
                        ) {
                            Icon(Icons.Default.Flag, contentDescription = null, tint = TextMuted)
                            Spacer(modifier = Modifier.width(4.dp))
                            Text("Report", color = TextMuted)
                        }
                    }
                }
            }
        }

        // My Creations Section
        if (myCreations.isNotEmpty()) {
            Spacer(modifier = Modifier.height(28.dp))
            Column(modifier = Modifier.fillMaxWidth()) {
                Text(
                    text = "MY RECENT CREATIONS",
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold,
                    color = AmberGold,
                    letterSpacing = 0.5.sp
                )
                Spacer(modifier = Modifier.height(12.dp))
                LazyRow(
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    items(myCreations) { item ->
                        val url = item.effectiveResultUrl
                        if (url != null) {
                            Card(
                                shape = RoundedCornerShape(12.dp),
                                colors = CardDefaults.cardColors(containerColor = CardSurface),
                                modifier = Modifier
                                    .width(140.dp)
                                    .height(200.dp)
                                    .border(1.dp, CardBorder, RoundedCornerShape(12.dp))
                                    .clickable {
                                        generatedOutputUrl = url
                                    }
                            ) {
                                Box(modifier = Modifier.fillMaxSize()) {
                                    AsyncImage(
                                        model = url,
                                        contentDescription = "Creation",
                                        contentScale = ContentScale.Crop,
                                        modifier = Modifier.fillMaxSize()
                                    )
                                    IconButton(
                                        onClick = { downloadMediaToDevice(context, url) },
                                        modifier = Modifier
                                            .align(Alignment.BottomEnd)
                                            .padding(4.dp)
                                            .background(Color.Black.copy(alpha = 0.6f), RoundedCornerShape(8.dp))
                                            .size(32.dp)
                                    ) {
                                        Icon(
                                            imageVector = Icons.Default.Download,
                                            contentDescription = "Download",
                                            tint = AmberGold,
                                            modifier = Modifier.size(16.dp)
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if (showReportDialog) {
        AlertDialog(
            onDismissRequest = { showReportDialog = false },
            title = { Text("Report Content", color = TextPrimary) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Help keep AI Prime Studio safe. Tell us why you are flagging this result:", color = TextSecondary, fontSize = 13.sp)
                    OutlinedTextField(
                        value = reportReason,
                        onValueChange = { reportReason = it },
                        modifier = Modifier.fillMaxWidth(),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedTextColor = TextPrimary,
                            unfocusedTextColor = TextPrimary
                        )
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        scope.launch {
                            repository.reportContent(
                                generationId = currentGenerationId,
                                reason = reportReason
                            )
                            showReportDialog = false
                            statusMessage = "Report submitted for safety review."
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = AmberGold)
                ) {
                    Text("Submit Report", color = Color.Black)
                }
            },
            dismissButton = {
                TextButton(onClick = { showReportDialog = false }) {
                    Text("Cancel", color = TextMuted)
                }
            },
            containerColor = CardSurface
        )
    }
}
