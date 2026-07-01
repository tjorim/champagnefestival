package be.champagnefestival.android.core.di

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewmodel.CreationExtras

/** Manual-DI ViewModel factory: builds a ViewModel from a plain constructor lambda. */
inline fun <reified T : ViewModel> simpleFactory(crossinline initializer: () -> T): ViewModelProvider.Factory =
    object : ViewModelProvider.Factory {
        override fun <VM : ViewModel> create(
            modelClass: Class<VM>,
            extras: CreationExtras,
        ): VM = initializer() as VM
    }
