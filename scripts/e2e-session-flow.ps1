$ErrorActionPreference = 'Stop'

$base = 'http://localhost:4000/api'
$frontendCandidates = @('http://localhost:5173/', 'http://localhost:5174/')
$stamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z0bcAAAAASUVORK5CYII='

$health = Invoke-RestMethod -Uri "$base/health" -Method Get
if ($health.status -ne 'ok') {
  throw 'Health check failed.'
}

$templates = Invoke-RestMethod -Uri "$base/templates" -Method Get
if (-not $templates -or $templates.Count -lt 1) {
  throw 'No templates available for testing.'
}

$template = $templates[0]
$templateDetail = Invoke-RestMethod -Uri "$base/templates/$($template.id)" -Method Get
if (-not $templateDetail.sections -or $templateDetail.sections.Count -lt 1) {
  throw 'Template has no sections.'
}

$trainerEmail = "copilot-trainer-$stamp@example.com"
$employeeEmail = "copilot-employee-$stamp@example.com"
$recipient = "recipient-$stamp@example.com"

$trainer = Invoke-RestMethod -Uri "$base/employees" -Method Post -ContentType 'application/json' -Body (@{
  firstName = 'Copilot'
  lastName = 'Trainer'
  email = $trainerEmail
  role = 'trainer'
  team = 'C-OPS'
} | ConvertTo-Json)

$employee = Invoke-RestMethod -Uri "$base/employees" -Method Post -ContentType 'application/json' -Body (@{
  firstName = 'Copilot'
  lastName = 'Employee'
  email = $employeeEmail
  role = 'employee'
  team = 'C-OPS'
} | ConvertTo-Json)

$trainerSession = Invoke-RestMethod -Uri "$base/trainers/login" -Method Post -ContentType 'application/json' -Body (@{
  identifier = $trainer.email
  pin = '2026'
} | ConvertTo-Json)

$session = Invoke-RestMethod -Uri "$base/training-sessions" -Method Post -ContentType 'application/json' -Body (@{
  employeeId = $employee.id
  templateId = $template.id
  trainerId = $trainerSession.id
  trainerName = $trainerSession.name
  trainerEmail = $trainerSession.email
  primaryRecipient = $recipient
} | ConvertTo-Json)

$sessionList = Invoke-RestMethod -Uri "$base/training-sessions?employeeId=$($employee.id)" -Method Get
if (-not ($sessionList | Where-Object { $_.id -eq $session.id })) {
  throw 'Created session not returned in session list.'
}

$reviews = @()
foreach ($section in $templateDetail.sections) {
  $reviews += @{
    sectionId = $section.id
    acknowledged = $true
    note = "verified-$stamp"
  }
}

$updatedSession = Invoke-RestMethod -Uri "$base/training-sessions/$($session.id)" -Method Patch -ContentType 'application/json' -Body (@{
  currentIndex = [Math]::Max($templateDetail.sections.Count - 1, 0)
  sectionReviews = $reviews
  primaryRecipient = $recipient
  employeeSignatureDataUrl = $pixel
  trainerSignatureDataUrl = $pixel
  trainerName = $trainerSession.name
  trainerEmail = $trainerSession.email
} | ConvertTo-Json -Depth 6)

if ($updatedSession.sectionReviews.Count -ne $templateDetail.sections.Count) {
  throw 'Session review persistence failed.'
}

$completedSession = Invoke-RestMethod -Uri "$base/training-sessions/$($session.id)" -Method Patch -ContentType 'application/json' -Body (@{
  status = 'completed'
} | ConvertTo-Json)
if ($completedSession.status -ne 'completed') {
  throw 'Session completion update failed.'
}

$submission = Invoke-RestMethod -Uri "$base/submissions" -Method Post -ContentType 'application/json' -Body (@{
  trainingSessionId = $session.id
  employeeId = $employee.id
  templateId = $template.id
  employeeName = $employee.name
  employeeEmail = $employee.email
  trainerName = $trainerSession.name
  trainerEmail = $trainerSession.email
  primaryRecipient = $recipient
  additionalCc = @($employee.email, $trainerSession.email)
  employeeSignatureDataUrl = $pixel
  trainerSignatureDataUrl = $pixel
  deliveryMode = 'draft'
  sectionReviews = $reviews
} | ConvertTo-Json -Depth 6)

$sessionAfterSubmission = Invoke-RestMethod -Uri "$base/training-sessions/$($session.id)" -Method Get
if ($sessionAfterSubmission.deliveryStatus -ne 'draft_saved') {
  throw 'Session delivery status was not updated to draft_saved.'
}
if ($sessionAfterSubmission.submissionId -ne $submission.id) {
  throw 'Session submission link was not persisted.'
}

$preparedSession = Invoke-RestMethod -Uri "$base/training-sessions/$($session.id)" -Method Patch -ContentType 'application/json' -Body (@{
  deliveryStatus = 'mail_prepared'
  status = 'delivered'
  submissionId = $submission.id
} | ConvertTo-Json)
if ($preparedSession.status -ne 'delivered' -or $preparedSession.deliveryStatus -ne 'mail_prepared') {
  throw 'Prepared delivery state update failed.'
}

$submissions = Invoke-RestMethod -Uri "$base/submissions?employeeId=$($employee.id)" -Method Get
$matchedSubmission = $submissions | Where-Object { $_.id -eq $submission.id }
if (-not $matchedSubmission) {
  throw 'Submission list did not return the new submission.'
}
if ($matchedSubmission.trainingSessionId -ne $session.id) {
  throw 'Submission did not retain trainingSessionId.'
}

$frontendResponse = $null
foreach ($candidate in $frontendCandidates) {
  try {
    $frontendResponse = Invoke-WebRequest -Uri $candidate -Method Get -UseBasicParsing
    if ($frontendResponse.StatusCode -eq 200) {
      break
    }
  } catch {
    continue
  }
}

if ($null -eq $frontendResponse) {
  throw 'Frontend did not respond on localhost:5173 or localhost:5174.'
}

if ($frontendResponse.StatusCode -ne 200) {
  throw 'Frontend did not return HTTP 200.'
}

[pscustomobject]@{
  health = $health.status
  templateId = $template.id
  trainerId = $trainer.id
  employeeId = $employee.id
  trainingSessionId = $session.id
  submissionId = $submission.id
  finalSessionStatus = $preparedSession.status
  finalDeliveryStatus = $preparedSession.deliveryStatus
  frontendStatus = $frontendResponse.StatusCode
}