{{- define "otelfleet.name" -}}
{{- .Chart.Name -}}
{{- end -}}

{{- define "otelfleet.fullname" -}}
{{- if contains .Chart.Name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name .Chart.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{- define "otelfleet.labels" -}}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version }}
app.kubernetes.io/name: {{ include "otelfleet.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- with .Values.podLabels }}
{{ toYaml . }}
{{- end }}
{{- end -}}

{{- define "otelfleet.selector" -}}
app.kubernetes.io/name: {{ include "otelfleet.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "otelfleet.controlPlaneImage" -}}
{{- printf "%s:%s" .Values.images.controlPlane.repository (.Values.images.controlPlane.tag | default .Chart.AppVersion) -}}
{{- end -}}

{{- define "otelfleet.collectorImage" -}}
{{- printf "%s:%s" .Values.images.collector.repository (.Values.images.collector.tag | default .Chart.AppVersion) -}}
{{- end -}}
