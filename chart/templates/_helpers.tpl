{{- define "ncaleague.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "ncaleague.fullname" -}}
{{- printf "%s-%s" .Release.Name (include "ncaleague.name" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "ncaleague.labels" -}}
app.kubernetes.io/name: {{ include "ncaleague.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}
