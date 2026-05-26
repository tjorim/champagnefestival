package be.champagnefestival.android.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable

private val LightColors = lightColorScheme(
    primary = ChampagneGold,
    onPrimary = MidnightNavy,
    secondary = SparklingAmber,
    onSecondary = MidnightNavy,
    background = WarmCream,
    onBackground = MidnightNavy,
    surface = ColorWhite,
    onSurface = DeepCharcoal,
    error = ErrorRed,
)

private val DarkColors = darkColorScheme(
    primary = SparklingAmber,
    onPrimary = MidnightNavy,
    secondary = ChampagneGold,
    onSecondary = MidnightNavy,
    background = MidnightNavy,
    onBackground = WarmCream,
    surface = DeepCharcoal,
    onSurface = WarmCream,
    error = ErrorRed,
)

@Composable
fun ChampagneFestivalTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        typography = AppTypography,
        content = content,
    )
}

private val ColorWhite = androidx.compose.ui.graphics.Color(0xFFFFFFFF)
